export type UserRole = 'admin' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: any;
  walletAddress?: string;
  contactEmail?: string;
}

export interface Certificate {
  id: string;
  studentEmail: string;
  studentName: string;
  certificateNumber: string;
  courseName: string;
  issueDate: string;
  imageUrl: string;
  ipfsHash?: string;
  tokenId?: string;
  txHash?: string;
  createdBy: string;
  mintedAt: any;
  isDigitalOnly?: boolean;
  studentWalletAddress?: string;
}
