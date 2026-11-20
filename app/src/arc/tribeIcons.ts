// Tribe shapes (Figma Components 588:578…599), by tribe id. Colour + shape always together; the name goes next to them.
import ai from '../assets/arc/tribe-ai.svg';
import xr from '../assets/arc/tribe-xr.svg';
import access from '../assets/arc/tribe-access.svg';
import health from '../assets/arc/tribe-health.svg';
import learning from '../assets/arc/tribe-learning.svg';
import society from '../assets/arc/tribe-society.svg';
import devices from '../assets/arc/tribe-devices.svg';
import design from '../assets/arc/tribe-design.svg';
import type { TribeId } from '../engine/types';

export const TRIBE_ICON: Record<TribeId, string> = { ai, xr, access, health, learning, society, devices, design };
