import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';

/** Google accounts with admin access on this site. */
export const ADMIN_EMAILS = ['forestparty223@gmail.com', 'sentralert@gmail.com'];

export function isAuthorizedAdmin(user) {
  return !!user && typeof user.email === 'string' && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

/**
 * Whether an admin is signed in on this site, from page load on (not only
 * while the admin panel is open). Updates on sign-in and sign-out.
 */
export function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (user) => setAdmin(isAuthorizedAdmin(user)));
  }, []);
  return admin;
}
