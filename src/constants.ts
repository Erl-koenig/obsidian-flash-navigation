import { FlashSettings } from "./types";

export const LINE_WEIGHT = 10;
export const BASE_WEIGHT = 4;
export const DEBOUNCE_DELAY = 50;

export const CSS_CLASSES = {
	DIM: "flash-dim",
	MATCH: "flash-match",
	LABEL: "flash-label",
	LABEL_QUESTION: "flash-label-question",
	STATUS_BAR: "flash-status-bar",
	STATUS_BAR_ACTIVE: "active",
	SETTINGS_WIDE_INPUT: "flash-settings-wide-input",
} as const;

export const DEFAULT_SETTINGS: FlashSettings = {
	dimColor: "",
	matchColor: "",
	matchFontWeight: "normal",
	caseSensitive: false,
	labelChars:
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	labelBackgroundColor: "",
	labelQuestionBackgroundColor: "",
	labelTextColor: "",
	labelFontWeight: "normal",
	statusBarPosition: "right",
	replaceChar: false,
	autoSourceMode: false,
};
