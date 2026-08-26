import { Editor, MarkdownView, MarkdownFileInfo, Plugin } from "obsidian";
import { Range, Text as CMText } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import {
	FlashSettings,
	ObsidianEditor,
	Match,
	CursorPosition,
	LastState,
	TargetLabel,
} from "./types";
import { DEFAULT_SETTINGS, DEBOUNCE_DELAY, CSS_CLASSES } from "./constants";
import {
	getVisibleRange,
	matchesEqual,
	sortMatchesByDistance,
	generateLabels,
} from "./utils";
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
	private pendingPrefix = "";
	private keydownHandler!: (event: KeyboardEvent) => void;
	private scrollHandler!: (event: Event) => void;
	private targetLabels: TargetLabel[] = [];
	private labelMap: Map<string, CursorPosition> = new Map();
	private prefixMap: Set<string> = new Set();
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
		this.scrollHandler = () => {
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

				const editorView = (
					this.activeView.editor as unknown as ObsidianEditor
				).cm;
				if (!editorView) return;

				event.preventDefault();

				if (event.key === "Backspace") {
					if (this.pendingPrefix.length > 0) {
						this.pendingPrefix = "";
						this.renderDecorations(editorView);
						this.updateStatusBar();
						return;
					}
					if (this.searchQuery.length > 0) {
						this.pendingPrefix = "";
						this.labelMap.clear();
						this.prefixMap.clear();
						this.targetLabels = [];
						this.searchQuery = this.searchQuery.slice(0, -1);
						this.updateStatusBar();
						this.updateHighlights();
					} else {
						this.exitFlashMode();
					}
					return;
				}

				if (event.key.length === 1) {
					// 1. If currently in prefix mode
					if (this.pendingPrefix.length > 0) {
						const targetKey = this.pendingPrefix + event.key;
						if (this.labelMap.has(targetKey)) {
							const target = this.labelMap.get(targetKey);
							if (target) {
								this.jumpToPosition(target);
								this.exitFlashMode();
							}
							return;
						}

						// Check if there is a deeper prefix (for 3+ char labels)
						let hasDeeperPrefix = false;
						for (const fullLabel of this.labelMap.keys()) {
							if (fullLabel.startsWith(targetKey)) {
								hasDeeperPrefix = true;
								break;
							}
						}

						if (hasDeeperPrefix) {
							this.pendingPrefix = targetKey;
							this.renderDecorations(editorView);
							this.updateStatusBar();
							return;
						}

						// Invalid second key in prefix mode - ignore
						return;
					}

					// 2. Not in prefix mode: check if it's an immediate 1-char jump label
					if (this.labelMap.has(event.key)) {
						const target = this.labelMap.get(event.key);
						if (target) {
							this.jumpToPosition(target);
							this.exitFlashMode();
						}
						return;
					}

					// 3. Check if it's the start of a multi-char prefix
					if (this.prefixMap.has(event.key)) {
						this.pendingPrefix = event.key;
						this.renderDecorations(editorView);
						this.updateStatusBar();
						return;
					}

					// 4. Regular search character
					this.pendingPrefix = "";
					this.labelMap.clear();
					this.prefixMap.clear();
					this.targetLabels = [];
					this.searchQuery += event.key;
					this.updateStatusBar();
					this.updateHighlights();
				}
			}
		};

		this.addCommand({
			id: "start-navigation",
			name: "Start navigation",
			editorCallback: (
				_editor: Editor,
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
		activeDocument.addEventListener("keydown", this.keydownHandler, {
			capture: true,
		});
		activeDocument.addEventListener("wheel", this.scrollHandler, {
			capture: true,
		});
	}

	private removeEventListeners(): void {
		activeDocument.removeEventListener("keydown", this.keydownHandler, {
			capture: true,
		});
		activeDocument.removeEventListener("wheel", this.scrollHandler, {
			capture: true,
		});
	}

	private startFlashMode(view: MarkdownView) {
		this.isActive = true;
		this.searchQuery = "";
		this.pendingPrefix = "";
		this.labelMap.clear();
		this.prefixMap.clear();
		this.targetLabels = [];
		this.activeView = view;
		this.wasInSourceMode = Boolean(view.getState().source);
		this.toggleSourceModeIfNeeded();

		this.addEventListeners();
		this.updateStatusBar();
		this.updateHighlights(); // initial update, dim text
	}

	private updateHighlights(): void {
		if (this.updateTimeout) {
			activeWindow.clearTimeout(this.updateTimeout);
		}

		this.updateTimeout = activeWindow.setTimeout(() => {
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
			this.pendingPrefix = "";
			editorView.dispatch({
				effects: clearAllEffect.of(null),
			});
		}

		this.lastState.query = this.searchQuery;

		if (this.searchQuery.length === 0) {
			this.dimVisibleText(editorView);
			this.lastState.matches = [];
			this.targetLabels = [];
			this.labelMap.clear();
			this.prefixMap.clear();
			return;
		}

		const matches = this.findMatches(editorView);

		if (matches.length === 0 && this.searchQuery.length > 0) {
			this.exitFlashMode();
			return;
		}

		// Update if matches changed or query changed
		if (!matchesEqual(matches, this.lastState.matches) || queryChanged) {
			this.lastState.matches = matches;
			this.computeTargetLabels(editorView, matches);
			this.renderDecorations(editorView);
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

	private computeTargetLabels(
		editorView: EditorView,
		matches: Match[],
	): void {
		const doc = editorView.state.doc;
		const availableChars = this.getAvailableLabelChars(editorView, matches);

		this.labelMap.clear();
		this.prefixMap.clear();
		this.targetLabels = [];

		let labels: string[] = [];

		if (this.settings.multiCharLabels) {
			labels = generateLabels(availableChars, matches.length);
		} else {
			// Legacy behavior: 1-char labels + '?' for overflow
			const total = matches.length;
			labels =
				total > availableChars.length
					? availableChars.concat(
							Array(total - availableChars.length).fill("?"),
						)
					: availableChars.slice(0, total);
		}

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			const label = labels[i];
			if (!label) continue;

			const pos = doc.lineAt(match.from);
			const cursorPos: CursorPosition = {
				line: pos.number - 1,
				ch: match.from - pos.from,
			};

			if (label !== "?") {
				this.labelMap.set(label, cursorPos);
				if (label.length > 1) {
					this.prefixMap.add(label[0]);
				}
			}

			this.targetLabels.push({
				match,
				label,
				pos: cursorPos,
			});
		}
	}

	private renderDecorations(editorView: EditorView): void {
		const doc = editorView.state.doc;
		const dimDecorations: Range<Decoration>[] = [];
		const matchDecorations: Range<Decoration>[] = [];
		const labelDecorations: Range<Decoration>[] = [];

		const dimDecoration = Decoration.mark({ class: CSS_CLASSES.DIM });
		const matchDecoration = Decoration.mark({ class: CSS_CLASSES.MATCH });

		const visibleRange = getVisibleRange(editorView);
		if (!visibleRange) return;

		const matchesInRange = this.lastState.matches.filter(
			(m) => m.from >= visibleRange.from && m.to <= visibleRange.to,
		);

		if (matchesInRange.length === 0) {
			dimDecorations.push(
				dimDecoration.range(visibleRange.from, visibleRange.to),
			);
		} else {
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

		for (const match of this.lastState.matches) {
			matchDecorations.push(matchDecoration.range(match.from, match.to));
		}

		this.createLabels(doc, this.targetLabels, labelDecorations);

		editorView.dispatch({
			effects: [
				clearAllEffect.of(null),
				addDimEffect.of(dimDecorations),
				addMatchEffect.of(matchDecorations),
				addLabelEffect.of(labelDecorations),
			],
		});
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
		const available = labelChars
			.split("")
			.filter((c) => !allNextChars.includes(c));

		return available.length > 0 ? available : labelChars.split("");
	}

	private createLabels(
		doc: CMText,
		targets: TargetLabel[],
		labelDecorations: Range<Decoration>[],
	): void {
		for (const target of targets) {
			const { match, label } = target;

			let isFocused = false;
			let displayLabel = label;
			const isQuestionMark = label === "?";

			if (this.pendingPrefix.length > 0) {
				if (label.startsWith(this.pendingPrefix)) {
					displayLabel = label.slice(this.pendingPrefix.length);
					isFocused = true;
				} else {
					// Omit label widgets that don't match the active prefix
					continue;
				}
			}

			const widget = new LabelWidget(
				displayLabel,
				isQuestionMark,
				isFocused,
				false,
			);

			if (this.settings.replaceChar && match.to < doc.length) {
				const nextChar = doc.sliceString(match.to, match.to + 1);
				if (nextChar === "\n") {
					const labelDecoration = Decoration.widget({
						widget,
						side: 1,
					});
					labelDecorations.push(labelDecoration.range(match.to));
				} else {
					const nextCharEnd = match.to + 1;
					const replaceDecoration = Decoration.replace({
						widget,
					});
					labelDecorations.push(
						replaceDecoration.range(match.to, nextCharEnd),
					);
				}
			} else {
				const labelDecoration = Decoration.widget({
					widget,
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
		this.pendingPrefix = "";
		this.labelMap.clear();
		this.prefixMap.clear();
		this.targetLabels = [];

		this.activeView = null;

		if (this.updateTimeout) {
			activeWindow.clearTimeout(this.updateTimeout);
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
		const loadedSettings =
			(await this.loadData()) as Partial<FlashSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(loadedSettings ?? {}),
		};
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
				activeDocument.documentElement.style.setProperty(key, value);
			} else {
				activeDocument.documentElement.style.removeProperty(key); // use fallback values (obsidian css variables)
			}
		});
	}

	private setupStatusBarItem(): void {
		if (!this.settings.enableStatusBar) {
			if (this.statusBarItem) {
				this.statusBarItem.remove();
				this.statusBarItem = null;
			}
			return;
		}

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
		if (!this.statusBarItem || !this.settings.enableStatusBar) {
			return;
		}

		if (this.isActive) {
			this.statusBarItem.addClass(CSS_CLASSES.STATUS_BAR_ACTIVE);
			const prefix =
				this.settings.statusBarPrefix ||
				DEFAULT_SETTINGS.statusBarPrefix;
			if (this.pendingPrefix.length > 0) {
				this.statusBarItem.setText(
					`${prefix} ${this.searchQuery} [${this.pendingPrefix}...]`,
				);
			} else {
				this.statusBarItem.setText(
					`${prefix} ${this.searchQuery || ""}`,
				);
			}
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
			activeWindow.setTimeout(() => {
				this.ignoreScrollEvents = false;
			}, 200);
		}
	}
}
