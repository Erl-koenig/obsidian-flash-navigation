import { Editor, MarkdownView, MarkdownFileInfo, Plugin } from "obsidian";
import { Range, Text as CMText } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import {
	FlashSettings,
	ObsidianEditor,
	Match,
	CursorPosition,
	LastState,
} from "./types";
import { DEFAULT_SETTINGS, DEBOUNCE_DELAY, CSS_CLASSES } from "./constants";
import { getVisibleRange, matchesEqual, sortMatchesByDistance } from "./utils";
import {
	flashDecorationField,
	addDimEffect,
	addMatchEffect,
	addLabelEffect,
	clearAllEffect,
} from "./decorators";
import { LabelWidget } from "./widgets";
import { FlashSettingsTab } from "./settings";
import { ExtendedApp } from "./types";

export default class FlashNavigation extends Plugin {
	settings!: FlashSettings;
	private isActive = false;
	private searchQuery = "";
	private keydownHandler!: (event: KeyboardEvent) => void;
	private scrollHandler!: (event: Event) => void;
	private labelMap: Map<string, CursorPosition> = new Map();
	private activeView: MarkdownView | null = null;
	private updateTimeout: number | null = null;
	private lastState: LastState = { matches: [], query: "" };
	private statusBarItem: HTMLElement | null = null;
	private wasInSourceMode = false;
	private ignoreScrollEvents = false;

	async onload() {
		await this.loadSettings();
		this.registerEditorExtension(flashDecorationField);
		this.updateCSSVariables();
		this.setupStatusBarItem();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.exitFlashMode();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.exitFlashMode();
			}),
		);
		this.scrollHandler = (event: Event) => {
			if (!this.ignoreScrollEvents) {
				this.exitFlashMode();
			}
		};

		this.keydownHandler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				this.exitFlashMode();
				return;
			}

			if (this.isActive) {
				const currentView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!currentView || currentView !== this.activeView) {
					this.exitFlashMode();
					return;
				}

				event.preventDefault();

				if (event.key === "Backspace") {
					if (this.searchQuery.length > 0) {
						this.labelMap.clear();
						this.searchQuery = this.searchQuery.slice(0, -1);
						this.updateStatusBar();
						this.updateHighlights();
					} else {
						this.exitFlashMode();
					}
					return;
				}

				// Check if jumping is possible
				if (this.labelMap.size > 0 && this.labelMap.has(event.key)) {
					const target = this.labelMap.get(event.key);
					if (target) {
						this.jumpToPosition(target);
						this.exitFlashMode();
					}
					return;
				}

				// adding a character
				if (event.key.length === 1) {
					this.labelMap.clear();
					this.searchQuery += event.key;
					this.updateStatusBar();
					this.updateHighlights();
				}
			}
		};

		this.addCommand({
			id: "start-flash-navigation",
			name: "Start navigation",
			editorCallback: (
				editor: Editor,
				ctx: MarkdownView | MarkdownFileInfo,
			) => {
				if (ctx instanceof MarkdownView && !this.isActive) {
					this.startFlashMode(ctx);
				}
			},
		});

		this.addSettingTab(new FlashSettingsTab(this.app, this));
	}

	onunload() {
		this.exitFlashMode();
	}

	private addEventListeners(): void {
		document.addEventListener("keydown", this.keydownHandler, {
			capture: true,
		});
		document.addEventListener("scroll", this.scrollHandler, {
			capture: true,
		});
		document.addEventListener("wheel", this.scrollHandler, {
			capture: true,
		});
	}

	private removeEventListeners(): void {
		document.removeEventListener("keydown", this.keydownHandler, {
			capture: true,
		});
		document.removeEventListener("scroll", this.scrollHandler, {
			capture: true,
		});
		document.removeEventListener("wheel", this.scrollHandler, {
			capture: true,
		});
	}

	private startFlashMode(view: MarkdownView) {
		this.isActive = true;
		this.searchQuery = "";
		this.labelMap.clear();
		this.activeView = view;
		this.wasInSourceMode = Boolean(view.getState().source);
		this.toggleSourceModeIfNeeded();

		this.addEventListeners();
		this.updateStatusBar();
		this.updateHighlights(); // initial update, dim text
	}

	private updateHighlights(): void {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		this.updateTimeout = window.setTimeout(() => {
			this.performUpdate();
		}, DEBOUNCE_DELAY);
	}

	private performUpdate(): void {
		if (!this.activeView) return;

		const editorView = (this.activeView.editor as unknown as ObsidianEditor)
			.cm;
		if (!editorView) return;

		const queryChanged = this.searchQuery !== this.lastState.query;
		if (queryChanged) {
			editorView.dispatch({
				effects: clearAllEffect.of(null),
			});
		}

		this.lastState.query = this.searchQuery;

		if (this.searchQuery.length === 0) {
			this.dimVisibleText(editorView);
			this.lastState.matches = [];
			return;
		}

		const matches = this.findMatches(editorView);

		if (matches.length === 0 && this.searchQuery.length > 0) {
			this.exitFlashMode();
			return;
		}

		// Only update if matches actually changed
		if (!matchesEqual(matches, this.lastState.matches)) {
			this.lastState.matches = matches;

			const decorations = this.createOptimizedDecorations(
				editorView,
				matches,
			);

			editorView.dispatch({
				effects: [
					addDimEffect.of(decorations.dim),
					addMatchEffect.of(decorations.match),
					addLabelEffect.of(decorations.label),
				],
			});
		}
	}

	private findMatches(editorView: EditorView): Match[] {
		const doc = editorView.state.doc;
		const visibleRange = getVisibleRange(editorView);

		if (!visibleRange) {
			return [];
		}

		const searchText = this.settings.caseSensitive
			? this.searchQuery
			: this.searchQuery.toLowerCase();

		const matches: Match[] = [];

		const text = doc.sliceString(visibleRange.from, visibleRange.to);
		const textToSearch = this.settings.caseSensitive
			? text
			: text.toLowerCase();

		let index = textToSearch.indexOf(searchText);
		while (index !== -1) {
			const globalFrom = visibleRange.from + index;
			const globalTo = globalFrom + searchText.length;
			matches.push({ from: globalFrom, to: globalTo });
			index = textToSearch.indexOf(searchText, index + 1);
		}

		return sortMatchesByDistance(
			doc,
			matches,
			this.app.workspace.getActiveViewOfType(MarkdownView),
		);
	}

	private dimVisibleText(editorView: EditorView): void {
		const dimDecorations: Range<Decoration>[] = [];
		const dimDecoration = Decoration.mark({ class: CSS_CLASSES.DIM });

		const visibleRange = getVisibleRange(editorView);

		if (visibleRange) {
			dimDecorations.push(
				dimDecoration.range(visibleRange.from, visibleRange.to),
			);
		}

		editorView.dispatch({
			effects: addDimEffect.of(dimDecorations),
		});
	}

	private createOptimizedDecorations(
		editorView: EditorView,
		matches: Match[],
	): {
		dim: Range<Decoration>[];
		match: Range<Decoration>[];
		label: Range<Decoration>[];
	} {
		const doc = editorView.state.doc;
		const dimDecorations: Range<Decoration>[] = [];
		const matchDecorations: Range<Decoration>[] = [];
		const labelDecorations: Range<Decoration>[] = [];

		const dimDecoration = Decoration.mark({ class: CSS_CLASSES.DIM });
		const matchDecoration = Decoration.mark({ class: CSS_CLASSES.MATCH });

		const visibleRange = getVisibleRange(editorView);

		if (!visibleRange) {
			return {
				dim: dimDecorations,
				match: matchDecorations,
				label: labelDecorations,
			};
		}

		const matchesInRange = matches.filter(
			(m) => m.from >= visibleRange.from && m.to <= visibleRange.to,
		);

		if (matchesInRange.length === 0) {
			// Dim entire visible range if no matches
			dimDecorations.push(
				dimDecoration.range(visibleRange.from, visibleRange.to),
			);
		} else {
			// Dim segments between matches
			let lastEnd = visibleRange.from;
			for (const match of matchesInRange) {
				if (lastEnd < match.from) {
					dimDecorations.push(
						dimDecoration.range(lastEnd, match.from),
					);
				}
				lastEnd = match.to;
			}
			if (lastEnd < visibleRange.to) {
				dimDecorations.push(
					dimDecoration.range(lastEnd, visibleRange.to),
				);
			}
		}

		// Highlight all matches
		for (const match of matches) {
			matchDecorations.push(matchDecoration.range(match.from, match.to));
		}

		const availableLabelChars = this.getAvailableLabelChars(
			editorView,
			matches,
		);
		const totalMatches = matches.length;
		const labelCharsToUse =
			totalMatches > availableLabelChars.length
				? availableLabelChars.concat(
						Array(totalMatches - availableLabelChars.length).fill(
							"?",
						),
					)
				: availableLabelChars.slice(0, totalMatches);

		this.createLabels(doc, matches, labelCharsToUse, labelDecorations);

		return {
			dim: dimDecorations,
			match: matchDecorations,
			label: labelDecorations,
		};
	}

	private getAvailableLabelChars(
		editorView: EditorView,
		matches: Match[],
	): string[] {
		const doc = editorView.state.doc;
		const nextChars: string[] = [];

		for (const match of matches) {
			if (match.to < doc.length) {
				const nextChar = doc.sliceString(match.to, match.to + 1);
				if (nextChar) {
					nextChars.push(nextChar);
				}
			}
		}

		const allNextChars = [...new Set(nextChars)];
		const labelChars = this.getSettingWithDefault("labelChars");
		return labelChars.split("").filter((c) => !allNextChars.includes(c));
	}

	private createLabels(
		doc: CMText,
		matches: Match[],
		labelChars: string[],
		labelDecorations: Range<Decoration>[],
	): void {
		for (let i = 0; i < Math.min(matches.length, labelChars.length); i++) {
			const match = matches[i];
			const label = labelChars[i];

			if (label !== "?") {
				const pos = doc.lineAt(match.from);
				this.labelMap.set(label, {
					line: pos.number - 1,
					ch: match.from - pos.from,
				});
			}

			if (this.settings.replaceChar && match.to < doc.length) {
				// Check if the next character is a new line (else it shifts the line to the previous one)
				const nextChar = doc.sliceString(match.to, match.to + 1);
				if (nextChar === "\n") {
					// dont replace newlines, just insert the label at the end (default behavior)
					const labelDecoration = Decoration.widget({
						widget: new LabelWidget(label, label === "?"),
						side: 1,
					});
					labelDecorations.push(labelDecoration.range(match.to));
				} else {
					const nextCharEnd = match.to + 1;
					const replaceDecoration = Decoration.replace({
						widget: new LabelWidget(label, label === "?"),
					});
					labelDecorations.push(
						replaceDecoration.range(match.to, nextCharEnd),
					);
				}
			} else {
				// Default behavior: insert label after match
				const labelDecoration = Decoration.widget({
					widget: new LabelWidget(label, label === "?"),
					side: 1,
				});
				labelDecorations.push(labelDecoration.range(match.to));
			}
		}
	}

	private jumpToPosition(target: { line: number; ch: number }): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		editor.setCursor(target.line, target.ch);
		editor.focus();
	}

	// Exit conditions:
	// No matches are found (similar to flash.nvim)
	// `escape` is pressed
	// `backspace` is pressed until search is empty
	// Scrolling happens (mousewheel, scrollbar, etc.)
	// The active view changes (e.g. switching files)
	private exitFlashMode(): void {
		if (!this.isActive) return;
		this.isActive = false;
		this.searchQuery = "";

		this.activeView = null;

		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}

		this.lastState = { matches: [], query: "" };

		this.updateStatusBar();

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const editorView = (activeView.editor as unknown as ObsidianEditor)
				.cm;
			editorView.dispatch({
				effects: clearAllEffect.of(null),
			});
		}

		this.removeEventListeners();
		this.toggleSourceModeIfNeeded();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateCSSVariables();
		this.setupStatusBarItem();
	}

	private getSettingWithDefault(key: keyof FlashSettings): string {
		const value = this.settings[key] as string;
		return value && value.trim() !== ""
			? value
			: (DEFAULT_SETTINGS[key] as string);
	}

	private updateCSSVariables(): void {
		const updates = {
			"--flash-dim-color": this.getSettingWithDefault("dimColor"),
			"--flash-match-color": this.getSettingWithDefault("matchColor"),
			"--flash-match-font-weight":
				this.getSettingWithDefault("matchFontWeight"),
			"--flash-label-bg-color": this.getSettingWithDefault(
				"labelBackgroundColor",
			),
			"--flash-label-question-bg-color": this.getSettingWithDefault(
				"labelQuestionBackgroundColor",
			),
			"--flash-label-text-color":
				this.getSettingWithDefault("labelTextColor"),
			"--flash-label-font-weight":
				this.getSettingWithDefault("labelFontWeight"),
		};

		Object.entries(updates).forEach(([key, value]) => {
			if (value && !value.startsWith("var(")) {
				document.documentElement.style.setProperty(key, value);
			} else {
				document.documentElement.style.removeProperty(key); // use fallback values (obsidian css variables)
			}
		});
	}

	private setupStatusBarItem(): void {
		if (!this.statusBarItem) {
			this.statusBarItem = this.addStatusBarItem();
			this.statusBarItem.addClass(CSS_CLASSES.STATUS_BAR);
		}

		if (this.settings.statusBarPosition === "left") {
			this.statusBarItem.addClass("left");
		} else {
			this.statusBarItem.removeClass("left");
		}
	}

	private updateStatusBar(): void {
		if (!this.statusBarItem) return;

		if (this.isActive) {
			this.statusBarItem.addClass(CSS_CLASSES.STATUS_BAR_ACTIVE);
			this.statusBarItem.setText(`⚡ ${this.searchQuery || ""}`);
		} else {
			this.statusBarItem.removeClass(CSS_CLASSES.STATUS_BAR_ACTIVE);
		}
	}

	private toggleSourceModeIfNeeded(): void {
		if (!this.wasInSourceMode && this.settings.autoSourceMode) {
			this.ignoreScrollEvents = true; // prevent scroll exit, as the layout shifts when entering source-mode
			(this.app as ExtendedApp).commands.executeCommandById(
				"editor:toggle-source",
			);
			setTimeout(() => {
				this.ignoreScrollEvents = false;
			}, 200);
		}
	}
}
