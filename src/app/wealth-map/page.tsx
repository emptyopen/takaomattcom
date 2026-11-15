import type { Metadata } from 'next';
import WealthMap from './wealth-map';
export const metadata: Metadata = { title: 'Wealth Atlas · Matt Takao', description: 'Explore the geography of prosperity, from the world to Census block groups. Free public data, relative and global perspectives.' };
export default function Page() { return <WealthMap />; }
