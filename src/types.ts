import { App } from "obsidian";
import { EditorView } from "@codemirror/view";

export interface FlashSettings {
	dimColor: string;
	matchColor: string;
	matchFontWeight: string;
	caseSensitive: boolean;
	labelChars: string;
	labelBackgroundColor: string;
	labelQuestionBackgroundColor: string;
	labelTextColor: string;
	labelFontWeight: string;
	statusBarPosition: "left" | "right";
	replaceChar: boolean;
	autoSourceMode: boolean;
}

export interface ExtendedApp extends App {
	commands: {
		executeCommandById: (commandId: string) => void;
	};
}

export interface ObsidianEditor {
	cm: EditorView;
}

export type Match = {
	from: number;
	to: number;
};

export type CursorPosition = {
	line: number;
	ch: number;
};

export type LastState = {
	matches: Match[];
	query: string;
};
