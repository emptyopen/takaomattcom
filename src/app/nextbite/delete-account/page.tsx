import type { Metadata } from 'next';
import DeleteAccountClient from './delete-account-client';

export const metadata: Metadata = {
  title: 'Delete your NextBite account · Matt Takao',
  description:
    'Request permanent deletion of your NextBite account and its associated data.',
};

export default function DeleteAccountPage() {
  return <DeleteAccountClient />;
}
