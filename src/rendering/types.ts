export type MapFocusRequest =
  | { type: "room"; roomNumber: number; requestId: number; shouldFocus: boolean };
