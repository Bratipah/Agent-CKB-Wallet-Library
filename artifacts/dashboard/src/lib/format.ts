export function formatCkb(shannons: string | number | null | undefined): string {
  if (!shannons) return '0.00 CKB';
  const val = typeof shannons === 'string' ? parseFloat(shannons) : shannons;
  if (isNaN(val)) return '0.00 CKB';
  return (val / 100000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' CKB';
}

export function truncateAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
