import { ethers, isAddress } from 'ethers';

const RPC_URL = (import.meta as any).env.VITE_RPC_URL;
const CONTRACT_ADDRESS = (import.meta as any).env.VITE_CONTRACT_ADDRESS;

export const CERTIFICATE_ABI = [
  "function mintIjazah(address studentAddress, uint256 tokenId, string tokenURI)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function owner() view returns (address)",
  "event IjazahDiterbitkan(address indexed penerima, uint256 indexed tokenId, string uri)",
  "error OwnableUnauthorizedAccount(address account)",
  "error OwnableInvalidOwner(address owner)",
  "error ERC721InvalidSender(address sender)",
  "error ERC721InvalidReceiver(address receiver)",
  "error ERC721InsufficientApproval(address operator, uint256 tokenId)"
];

export function getProvider() {
  if (!RPC_URL) throw new Error('VITE_RPC_URL is not defined');
  return new ethers.JsonRpcProvider(RPC_URL);
}

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, CERTIFICATE_ABI, signerOrProvider);
}

export async function mintingProses(studentAddress: string, tokenId: number, tokenURI: string) {
  if (!isAddress(studentAddress)) {
    throw new Error(`Alamat tidak valid: ${studentAddress}. Pastikan ini bukan transaction hash!`);
  }
}

export function getAdminWallet(provider: ethers.Provider) {
  const pk = (import.meta as any).env.VITE_PRIVATE_KEY || (import.meta as any).env.PRIVATE_KEY;

  if (!pk) {
    console.error('PRIVATE_KEY or VITE_PRIVATE_KEY not found in import.meta.env');
    return null;
  }
  
  try {
    const formattedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
    return new ethers.Wallet(formattedPk, provider);
  } catch (error) {
    console.error('Failed to create wallet from private key:', error);
    return null;
  }
}
