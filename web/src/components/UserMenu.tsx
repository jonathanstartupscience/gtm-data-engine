/** Sidebar user control: Clerk UserButton (profile + sign-out) when signed in.
 *  Renders nothing if Clerk isn't configured (open mode), so the app still works. */
import { useUser, UserButton } from '@clerk/clerk-react';

export function UserMenu() {
  // useUser throws if no ClerkProvider; guard by checking the publishable key.
  const hasClerk = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!hasClerk) return null;
  return <UserMenuInner />;
}

function UserMenuInner() {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return null;
  const name = user.fullName || user.primaryEmailAddress?.emailAddress || 'Account';
  return (
    <div className="user-menu">
      <UserButton afterSignOutUrl="/" />
      <div className="user-name" title={name}>{name}</div>
    </div>
  );
}
