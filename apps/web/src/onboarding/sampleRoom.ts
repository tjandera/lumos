/**
 * Prebuilt "sample living room" document for the first-run walkthrough's
 * "Start with a sample room" choice — a plain 4m x 3.5m rectangular room
 * with one door and one window, no furniture, so the very next walkthrough
 * step (drag in a furniture item) has an empty floor to drop onto.
 *
 * Built from the same room/opening helpers the Plan editor itself uses
 * (`editor/roomOps`), so this is exactly the kind of document a user could
 * have drawn by hand — no special-cased fields.
 */

import { createEmptyDocument, type SceneDocument } from "@interior/core";
import { addOpening, addRoom, createOpening, createRoom } from "../editor/roomOps";

const ROOM_WIDTH_M = 4;
const ROOM_DEPTH_M = 3.5;

export function buildSampleLivingRoomDocument(): SceneDocument {
  const empty = createEmptyDocument("Sample living room");

  const room = {
    ...createRoom("Living Room", 0.12, 2.5),
    walls: [
      { x: 0, y: 0 },
      { x: ROOM_WIDTH_M, y: 0 },
      { x: ROOM_WIDTH_M, y: ROOM_DEPTH_M },
      { x: 0, y: ROOM_DEPTH_M }
    ]
  };

  let doc = addRoom(empty, room);
  // Door on the front wall (walls[0] -> walls[1]), window on the back wall
  // (walls[2] -> walls[3]) — both well clear of the corners on a 4m run.
  doc = addOpening(doc, room.id, createOpening("door", 0, 0.3));
  doc = addOpening(doc, room.id, createOpening("window", 2, 1.2));

  return doc;
}
