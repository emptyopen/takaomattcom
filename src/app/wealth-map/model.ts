export const palette = ['#334e75', '#427b98', '#66b4ad', '#bdce8c', '#f2d278', '#ed9c62', '#dc6751'];
export function median(values: number[]) { const a = values.filter(v => v > 0 && Number.isFinite(v)).sort((a,b) => a-b); const m = Math.floor(a.length / 2); return a.length ? (a.length % 2 ? a[m] : (a[m-1]+a[m])/2) : null; }
export function globalIndex(value: number | null, kind: string, meta: {usIncome:number;usGDP:number;worldGDP:number}) { return value && value > 0 ? (kind === 'country' ? value : value / meta.usIncome * meta.usGDP) / meta.worldGDP : null; }
export function color(value: number | null, anchor: number) { if (!value || value <= 0) return '#29353e'; const t = Math.max(0, Math.min(1, (Math.log2(value / anchor) + 3) / 6)); return palette[Math.min(6, Math.floor(t * 7))]; }
