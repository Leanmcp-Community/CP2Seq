
IMAGES-ONLY CONDITION. In this run no coordinates are given in JSON: the crease pattern,
the target and the current state are shown only as the attached images. Ignore any
instruction above that refers to coordinates, polygons or sheet_polygon fields in JSON.

The sheet is the unit square, x from 0 to 1 and y from 0 to 1, x right and y up, as drawn
in the CP image. Images are scaled to fit the canvas and carry no axes. The one numeric
cue you get is current.stack_bounding_box: the extent of the current stack in current
folded coordinates. Use it to read positions off the current-state images when you choose
a fold line and offset. Tool results report whether a fold was accepted and why it was
rejected, but not the new geometry; look at the new images instead.
