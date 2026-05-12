const PINATA_API_KEY = (import.meta as any).env.VITE_PINATA_API_KEY;
const PINATA_API_SECRET = (import.meta as any).env.VITE_PINATA_API_SECRET;

export async function uploadToIPFS(blob: Blob, fileName: string) {
  if (!PINATA_API_KEY || !PINATA_API_SECRET) {
    throw new Error('Pinata credentials are missing');
  }

  const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
  
  const data = new FormData();
  data.append('file', blob, fileName);
  
  const metadata = JSON.stringify({
    name: fileName,
  });
  data.append('pinataMetadata', metadata);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_API_SECRET,
    },
    body: data,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Pinata upload failed: ${errorData.error?.details || response.statusText}`);
  }

  return await response.json(); // returns { IpfsHash, PinSize, Timestamp }
}

export async function uploadJSONToIPFS(jsonData: any) {
  const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'pinata_api_key': PINATA_API_KEY,
      'pinata_secret_api_key': PINATA_API_SECRET,
    },
    body: JSON.stringify({
      pinataContent: jsonData,
      pinataMetadata: {
        name: `metadata_${Date.now()}.json`
      }
    }),
  });

  if (!response.ok) {
    throw new Error('Pinata JSON upload failed');
  }

  return await response.json();
}
