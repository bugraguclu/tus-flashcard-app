import type { ScreenGuardSnapshot } from '../lib/screenGuardPolicy';

/**
 * Screen capture and screenshot blocking has been removed.
 * Shield component renders nothing.
 */
export default function ProtectedContentShield(_props: { state?: ScreenGuardSnapshot }) {
    return null;
}
