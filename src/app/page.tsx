import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/admin');
  // return null; // redirect will handle this
}
