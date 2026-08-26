import { EditorView } from "@codemirror/view";
import { Text as CMText } from "@codemirror/state";
import { CursorPosition, Match } from "./types";
import { LINE_WEIGHT, BASE_WEIGHT } from "./constants";
import { MarkdownView } from "obsidian";

export function getVisibleRange(
	editorView: EditorView,
): { from: number; to: number } | null {
	const rect = editorView.dom.getBoundingClientRect();
	const sampleX = rect.left + Math.min(80, rect.width / 2);
	const topPos = editorView.posAtCoords({ x: sampleX, y: rect.top + 10 });
	const bottomPos = editorView.posAtCoords({
		x: sampleX,
		y: rect.bottom - 10,
	});

	if (topPos !== null && bottomPos !== null) {
		return {
			from: Math.min(topPos, bottomPos),
			to: Math.max(topPos, bottomPos),
		};
	}

	if (editorView.viewport) {
		return {
			from: editorView.viewport.from,
			to: editorView.viewport.to,
		};
	}

	return null;
}

export function matchesEqual(a: Match[], b: Match[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].from !== b[i].from || a[i].to !== b[i].to) return false;
	}
	return true;
}

export function getDistance(
	doc: CMText,
	cursorPos: CursorPosition,
	matchFrom: number,
): number {
	const matchPos = doc.lineAt(matchFrom);
	const matchLine = matchPos.number - 1;
	const matchCh = matchFrom - matchPos.from;

	const lineDiff = cursorPos.line - matchLine;
	const charDiff = cursorPos.ch - matchCh;
	return (
		lineDiff * lineDiff * LINE_WEIGHT + charDiff * charDiff + BASE_WEIGHT
	);
}

export function sortMatchesByDistance(
	doc: CMText,
	matches: Match[],
	activeView: MarkdownView | null,
): Match[] {
	if (!activeView) return matches;

	const editor = activeView.editor;
	const cursorPos = editor.getCursor();

	return matches.sort((a, b) => {
		const distanceA = getDistance(doc, cursorPos, a.from);
		const distanceB = getDistance(doc, cursorPos, b.from);
		return distanceA - distanceB;
	});
}

/**
 * Generates a list of prefix-free labels for `targetCount` items using the alphabet `chars`.
 * Guarantees that no label is a prefix of any other label.
 * Prioritizes 1-character labels for earlier (closer) matches and branches into 2-character
 * (or multi-character) prefixes only as needed for remaining matches.
 */
export function generateLabels(chars: string[], targetCount: number): string[] {
	if (targetCount <= 0 || chars.length === 0) return [];
	if (targetCount <= chars.length) {
		return chars.slice(0, targetCount);
	}

	const n = chars.length;
	if (n === 1) {
		return Array(targetCount).fill(chars[0]);
	}

	// Each prefix character used replaces 1 single-char slot with n multi-char slots (net gain of n - 1 slots).
	// We need totalSlots >= targetCount => n + prefixesNeeded * (n - 1) >= targetCount
	// prefixesNeeded = Math.ceil((targetCount - n) / (n - 1))
	const prefixesNeeded = Math.ceil((targetCount - n) / (n - 1));

	if (prefixesNeeded < n) {
		const singleCount = n - prefixesNeeded;
		const labels: string[] = [];

		// 1. Assign single-character labels to the closest targets
		for (let i = 0; i < singleCount; i++) {
			labels.push(chars[i]);
		}

		// 2. Assign 2-character labels (prefix + sub-character) for the remaining targets
		let remaining = targetCount - singleCount;
		for (let p = 0; p < prefixesNeeded; p++) {
			const prefix = chars[singleCount + p];
			const countForThisPrefix = Math.min(remaining, n);
			for (let sub = 0; sub < countForThisPrefix; sub++) {
				labels.push(prefix + chars[sub]);
			}
			remaining -= countForThisPrefix;
		}

		return labels;
	} else {
		// Deep tree recursion if targetCount > n^2
		const labels: string[] = [];
		const basePerPrefix = Math.floor(targetCount / n);
		let remainder = targetCount % n;

		for (let i = 0; i < n; i++) {
			const countForThisPrefix = basePerPrefix + (remainder > 0 ? 1 : 0);
			if (remainder > 0) remainder--;

			if (countForThisPrefix > 0) {
				const subLabels = generateLabels(chars, countForThisPrefix);
				for (const sub of subLabels) {
					labels.push(chars[i] + sub);
				}
			}
		}

		return labels;
	}
}
