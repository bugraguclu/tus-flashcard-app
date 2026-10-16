interface PressCoordinates {
    locationX?: number;
    locationY?: number;
    clientX?: number;
    clientY?: number;
}

/** RN uses local touch coordinates; RN Web onPress supplies a browser MouseEvent. */
export function chartPressPoint(
    event: PressCoordinates,
    bounds?: { left: number; top: number },
): { x: number; y: number } | null {
    if (Number.isFinite(event.locationX) && Number.isFinite(event.locationY)) {
        return { x: event.locationX!, y: event.locationY! };
    }
    if (bounds && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        return { x: event.clientX! - bounds.left, y: event.clientY! - bounds.top };
    }
    return null;
}
