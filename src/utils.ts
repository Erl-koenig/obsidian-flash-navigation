import { EditorView } from "@codemirror/view";
import { Text as CMText } from "@codemirror/state";
import { CursorPosition, Match } from "./types";
import { LINE_WEIGHT, BASE_WEIGHT } from "./constants";
import { MarkdownView } from "obsidian";

export function getVisibleRange(
	editorView: EditorView,
): { from: number; to: number } | null {
	const rect = editorView.dom.getBoundingClientRect();
	const topPos = editorView.posAtCoords({ x: rect.left, y: rect.top });
	const bottomPos = editorView.posAtCoords({
		x: rect.left,
		y: rect.bottom,
	});

	if (topPos === null || bottomPos === null) {
		return null;
	}

	return { from: topPos, to: bottomPos };
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
