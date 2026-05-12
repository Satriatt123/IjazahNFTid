import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {ethers} from "ethers";

admin.initializeApp();

/**
 * Minting Ijazah menggunakan Firebase Functions v2.
 * Parameter (data, context) sekarang dibungkus dalam (request).
 */
export const mintIjazah = onCall({
  secrets: ["ADMIN_PRIVATE_KEY"],
  maxInstances: 10,
}, async (request) => {
  // 1. Verifikasi Login (Dulu context.auth)
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Wajib login.");
  }

  // 2. Verifikasi Role Admin
  const userDoc = await admin.firestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();

  if (userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Khusus Admin.");
  }

  // 3. Ambil data (Dulu parameter data)
  const {recipientAddress, ipfsUri} = request.data;

  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.VITE_RPC_URL
    );

    // Private key diambil aman dari Secret Manager
    const wallet = new ethers.Wallet(
      process.env.ADMIN_PRIVATE_KEY as string,
      provider
    );

    const contractAddress = "ALAMAT_CONTRACT_KAMU";
    const abi = ["function safeMint(address to, string uri) public"];
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    const tx = await contract.safeMint(recipientAddress, ipfsUri);
    const receipt = await tx.wait();

    return {success: true, hash: receipt.hash};
  } catch (error: unknown) {
    const err = error as Error;
    throw new HttpsError("internal", err.message);
  }
});
