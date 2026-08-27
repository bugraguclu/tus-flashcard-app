import { useEffect, useState } from 'react';

/**
 * A deck route parameter is an entry/deep-link instruction, not the ongoing UI state of a
 * filterable screen. Keep later choices local so the screen is not remounted, while still
 * accepting a genuinely new route/deep link when it arrives.
 */
export function useRouteDeckScope(routeDeckName: string | null) {
    const [deckScope, setDeckScope] = useState<string | null>(routeDeckName);

    useEffect(() => {
        setDeckScope(routeDeckName);
    }, [routeDeckName]);

    return [deckScope, setDeckScope] as const;
}
