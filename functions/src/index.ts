import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {ethers} from "ethers";
import FormData from "form-data";
import axios from "axios";

admin.initializeApp();

/**
 * 1. GET NONCE
 * Menciptakan tantangan unik untuk login wallet.
 */
export const getNonce = onCall(async (request) => {
  const {address} = request.data;
  if (!ethers.isAddress(address)) {
    throw new HttpsError("invalid-argument", "Wallet tidak valid.");
  }

  const randomId = Math.floor(Math.random() * 1000000);
  const nonce = `Sadewa Auth Challenge: ${randomId}`;

  await admin.firestore().collection("nonces").doc(address.toLowerCase()).set({
    nonce,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {nonce};
});

/**
 * 2. VERIFY SIGNATURE
 * Validasi tanda tangan dan berikan token akses Firebase.
 */
export const verifySignature = onCall(async (request) => {
  const {address, signature} = request.data;
  const addrLower = address.toLowerCase();

  const nonceDoc = await admin.firestore()
    .collection("nonces").doc(addrLower).get();

  const data = nonceDoc.data();
  // Menghapus (!) dengan pengecekan manual agar TypeScript tenang
  if (!nonceDoc.exists || !data) {
    throw new HttpsError("not-found", "Nonce kadaluarsa.");
  }

  const recoveredAddress = ethers.verifyMessage(data.nonce, signature);

  if (recoveredAddress.toLowerCase() !== addrLower) {
    throw new HttpsError("permission-denied", "Tanda tangan salah.");
  }

  await admin.firestore().collection("nonces").doc(addrLower).delete();
  const firebaseToken = await admin.auth().createCustomToken(addrLower);

  return {token: firebaseToken};
});

/**
 * 3. UPLOAD FILE TO IPFS (Secure Proxy)
 */
export const uploadToIPFS = onCall({
  secrets: ["PINATA_JWT"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Wajib login.");

  const {fileName, fileBase64} = request.data;
  const fileBuffer = Buffer.from(fileBase64, "base64");

  try {
    const formData = new FormData();
    formData.append("file", fileBuffer, {filename: fileName});

    // Memecah URL agar tidak kena max-len 80 karakter
    const pinUrl = "https://api.pinata.cloud/pinning/pinFileToIPFS";
    const res = await axios.post(pinUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
    });

    return {ipfsHash: res.data.IpfsHash};
  } catch (error: unknown) {
    const err = error as Error;
    throw new HttpsError("internal", err.message);
  }
});

/**
 * 4. UPLOAD JSON TO IPFS (Secure Proxy)
 */
export const uploadJSONToIPFS = onCall({
  secrets: ["PINATA_JWT"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Wajib login.");

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Data JSON tidak valid.");
  }

  try {
    const jsonUrl = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
    const res = await axios.post(jsonUrl, request.data, {
      headers: {
        "Authorization": `Bearer ${process.env.PINATA_JWT}`,
        "Content-Type": "application/json",
      },
    });

    return {ipfsHash: res.data.IpfsHash};
  } catch (error: unknown) {
    const err = error as Error;
    throw new HttpsError("internal", err.message);
  }
});

/**
 * 5. MINT IJAZAH (Admin Only)
 */
export const mintIjazah = onCall({
  secrets: ["ADMIN_PRIVATE_KEY"],
  maxInstances: 10,
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Wajib login.");

  const userDoc = await admin.firestore()
    .collection("users").doc(request.auth.uid).get();

  const userData = userDoc.data();
  if (!userData || userData.role !== "admin") {
    throw new HttpsError("permission-denied", "Khusus Admin.");
  }

  const {recipientAddress, ipfsUri} = request.data;

  try {
    const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL);
    const wallet = new ethers.Wallet(
      process.env.ADMIN_PRIVATE_KEY as string,
      provider
    );

    const contractAddress = "0xb5B4d9abEe126EA053f820CD648B9215352Ca84f";
    const abi = ["function safeMint(address to, string uri) public"];
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    const tx = await contract.safeMint(recipientAddress, ipfsUri);
    const receipt = await tx.wait();

    if (!receipt) throw new Error("Gagal konfirmasi transaksi.");
    return {success: true, hash: receipt.hash};
  } catch (error: unknown) {
    const err = error as Error;
    throw new HttpsError("internal", err.message);
  }
});
