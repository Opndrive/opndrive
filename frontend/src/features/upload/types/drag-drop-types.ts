/**
 * Drag and Drop Types
 *
 * Where a dropped set of files is headed.
 *
 * The source of a drag used to be modelled here too - who was dragging, how
 * many items, whether the app or the OS started it. None of it could be known
 * while a drag was in flight (the browser hides the files until the drop) and
 * so all of it was guessed at and stored, which is what made a folder's
 * willingness to take a drop depend on state some other component had written
 * first. Targets are now read from the drop event, and the guesses are gone.
 */

export type DragDropTarget = {
  type: 'folder' | 'directory' | 'global';
  id: string;
  path: string;
  name: string;
};
