import {
	App,
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

import {
	StateField,
	StateEffect,
	Range,
	Text as CMText,
} from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";

interface FlashSettings {
	dimColor: string;
	matchColor: string;
	matchFontWeight: string;
	caseSensitive: boolean;
	labelChars: string;
	labelBackgroundColor: string;
	labelQuestionBackgroundColor: string;
	labelTextColor: string;
	labelFontWeight: string;
}

interface ObsidianEditor {
	cm: EditorView;
}

type Match = {
	from: number;
	to: number;
};

type CursorPosition = {
	line: number;
	ch: number;
};

type LastState = {
	matches: Match[];
	query: string;
};

const LINE_WEIGHT = 10;
const BASE_WEIGHT = 4;
const DEBOUNCE_DELAY = 50;

// CSS class name constants
const CSS_CLASSES = {
	DIM: "flash-dim",
	MATCH: "flash-match",
	LABEL: "flash-label",
	LABEL_QUESTION: "flash-label-question",
	STATUS_BAR: "flash-status-bar",
	STATUS_BAR_ACTIVE: "active",
	SETTINGS_WIDE_INPUT: "flash-settings-wide-input",
} as const;

const DEFAULT_SETTINGS: FlashSettings = {
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
};

const addDimEffect = StateEffect.define<Range<Decoration>[]>();
const addMatchEffect = StateEffect.define<Range<Decoration>[]>();
const addLabelEffect = StateEffect.define<Range<Decoration>[]>();
const clearAllEffect = StateEffect.define();

const flashDecorationField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, transaction) {
		decorations = decorations.map(transaction.changes);

		for (const effect of transaction.effects) {
			if (effect.is(addDimEffect)) {
				decorations = decorations.update({
					add: effect.value,
					sort: true,
				});
			} else if (effect.is(addMatchEffect)) {
				decorations = decorations.update({
					add: effect.value,
					sort: true,
				});
			} else if (effect.is(addLabelEffect)) {
				decorations = decorations.update({
					add: effect.value,
					sort: true,
				});
			} else if (effect.is(clearAllEffect)) {
				decorations = Decoration.none;
			}
		}

		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export default class FlashNavigation extends Plugin {
	settings!: FlashSettings;
	private isActive = false;
	private searchQuery = "";
	private escapeHandler!: (event: KeyboardEvent) => void;
	private keyHandler!: (event: KeyboardEvent) => void;
	private labelMap: Map<string, CursorPosition> = new Map();
	private activeView: MarkdownView | null = null;
	private updateTimeout: number | null = null;
	private lastState: LastState = { matches: [], query: "" };
	private statusBarItem: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		this.registerEditorExtension(flashDecorationField);
		this.updateCSSVariables();

		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass(CSS_CLASSES.STATUS_BAR);

		// Exit flash mode when: 1) active view changes 2) file is opened 3) `escape` is pressed
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.isActive) {
					this.exitFlashMode();
				}
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				if (this.isActive) {
					this.exitFlashMode();
				}
			}),
		);
		this.escapeHandler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				this.exitFlashMode();
			}
		};

		this.keyHandler = (event: KeyboardEvent) => {
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

	private startFlashMode(view: MarkdownView) {
		this.isActive = true;
		this.searchQuery = "";
		this.labelMap.clear();
		this.activeView = view;

		document.addEventListener("keydown", this.escapeHandler, {
			capture: true,
		});
		document.addEventListener("keydown", this.keyHandler, {
			capture: true,
		});

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
		if (!this.matchesEqual(matches, this.lastState.matches)) {
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

	// Need to calculate it manually because `visibleRanges` is not the exact viewport...
	private getVisibleRange(
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

	private findMatches(editorView: EditorView): Match[] {
		const doc = editorView.state.doc;
		const visibleRange = this.getVisibleRange(editorView);

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

		return this.sortMatchesByDistance(doc, matches);
	}

	private matchesEqual(a: Match[], b: Match[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i].from !== b[i].from || a[i].to !== b[i].to) return false;
		}
		return true;
	}

	private dimVisibleText(editorView: EditorView): void {
		const dimDecorations: Range<Decoration>[] = [];
		const dimDecoration = Decoration.mark({ class: CSS_CLASSES.DIM });

		const visibleRange = this.getVisibleRange(editorView);

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

		this.labelMap.clear();

		const visibleRange = this.getVisibleRange(editorView);

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

	private getDistance(
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
			lineDiff * lineDiff * LINE_WEIGHT +
			charDiff * charDiff +
			BASE_WEIGHT
		);
	}

	private sortMatchesByDistance(doc: CMText, matches: Match[]): Match[] {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return matches;

		const editor = activeView.editor;
		const cursorPos = editor.getCursor();

		return matches.sort((a, b) => {
			const distanceA = this.getDistance(doc, cursorPos, a.from);
			const distanceB = this.getDistance(doc, cursorPos, b.from);
			return distanceA - distanceB;
		});
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

			const labelDecoration = Decoration.widget({
				widget: new LabelWidget(label, label === "?"),
				side: 1,
			});

			labelDecorations.push(labelDecoration.range(match.to));
		}
	}

	private jumpToPosition(target: { line: number; ch: number }): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		editor.setCursor(target.line, target.ch);
		editor.focus();
	}

	private exitFlashMode(): void {
		if (!this.isActive) return;
		this.isActive = false;
		this.searchQuery = "";
		this.labelMap.clear();
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

		document.removeEventListener("keydown", this.escapeHandler, {
			capture: true,
		});
		document.removeEventListener("keydown", this.keyHandler, {
			capture: true,
		});
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

	private updateStatusBar(): void {
		if (!this.statusBarItem) return;

		if (this.isActive) {
			this.statusBarItem.addClass(CSS_CLASSES.STATUS_BAR_ACTIVE);
			this.statusBarItem.setText(`⚡ ${this.searchQuery || ""}`);
		} else {
			this.statusBarItem.removeClass(CSS_CLASSES.STATUS_BAR_ACTIVE);
		}
	}
}

class LabelWidget extends WidgetType {
	constructor(
		private label: string,
		private isQuestionMark: boolean = false,
	) {
		super();
	}

	toDOM() {
		const span = document.createElement("span");
		span.className = this.isQuestionMark
			? `${CSS_CLASSES.LABEL} ${CSS_CLASSES.LABEL_QUESTION}`
			: CSS_CLASSES.LABEL;
		span.textContent = this.label;
		return span;
	}

	eq(other: WidgetType): boolean {
		return (
			other instanceof LabelWidget &&
			other.label === this.label &&
			other.isQuestionMark === this.isQuestionMark
		);
	}
}

class FlashSettingsTab extends PluginSettingTab {
	plugin: FlashNavigation;

	constructor(app: App, plugin: FlashNavigation) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("Search behavior").setHeading();

		new Setting(containerEl)
			.setName("Case sensitive")
			.setDesc("Whether search should be case sensitive")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.caseSensitive)
					.onChange(async (value) => {
						this.plugin.settings.caseSensitive = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Label characters")
			.setDesc("Characters used for jump labels")
			.addText((text) => {
				text.setPlaceholder("abcdefghijklmnopqrstuvwxyz...")
					.setValue(this.plugin.settings.labelChars)
					.onChange(async (value) => {
						this.plugin.settings.labelChars = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass(CSS_CLASSES.SETTINGS_WIDE_INPUT);
			})
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.labelChars =
							DEFAULT_SETTINGS.labelChars;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl).setName("Visual styling").setHeading();

		new Setting(containerEl)
			.setName("Dim color")
			.setDesc(
				"The color used to dim text in flash navigation mode (e.g., rgba(128, 128, 128, 0.5))",
			)
			.addText((text) =>
				text
					.setPlaceholder("rgba(128, 128, 128, 0.5)")
					.setValue(this.plugin.settings.dimColor)
					.onChange(async (value) => {
						this.plugin.settings.dimColor = value;
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.dimColor =
							DEFAULT_SETTINGS.dimColor;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Match color")
			.setDesc(
				"The color used to highlight matching text (e.g., rgb(0, 191, 255) or #00bfff)",
			)
			.addText((text) =>
				text
					.setPlaceholder("rgb(0,191,255)")
					.setValue(this.plugin.settings.matchColor)
					.onChange(async (value) => {
						this.plugin.settings.matchColor = value;
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.matchColor =
							DEFAULT_SETTINGS.matchColor;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Match font weight")
			.setDesc("The font weight for highlighted matches")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("normal", "Normal")
					.addOption("bold", "Bold")
					.setValue(this.plugin.settings.matchFontWeight)
					.onChange(async (value) => {
						this.plugin.settings.matchFontWeight = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Label styling").setHeading();

		new Setting(containerEl)
			.setName("Label background color")
			.setDesc(
				"The background color for jump labels (e.g., #a3be8c or rgb(163, 190, 140))",
			)
			.addText((text) =>
				text
					.setPlaceholder("#a3be8c")
					.setValue(this.plugin.settings.labelBackgroundColor)
					.onChange(async (value) => {
						this.plugin.settings.labelBackgroundColor = value;
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.labelBackgroundColor =
							DEFAULT_SETTINGS.labelBackgroundColor;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Overflow question mark label color")
			.setDesc(
				"The background color for overflow question mark labels (e.g., #ebcb8b)",
			)
			.addText((text) =>
				text
					.setPlaceholder("#ebcb8b")
					.setValue(this.plugin.settings.labelQuestionBackgroundColor)
					.onChange(async (value) => {
						this.plugin.settings.labelQuestionBackgroundColor =
							value;
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.labelQuestionBackgroundColor =
							DEFAULT_SETTINGS.labelQuestionBackgroundColor;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Label text color")
			.setDesc(
				"The text color for jump labels (e.g., black, white, #000000)",
			)
			.addText((text) =>
				text
					.setPlaceholder("black")
					.setValue(this.plugin.settings.labelTextColor)
					.onChange(async (value) => {
						this.plugin.settings.labelTextColor = value;
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.labelTextColor =
							DEFAULT_SETTINGS.labelTextColor;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName("Label font weight")
			.setDesc("The font weight for jump labels")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("normal", "Normal")
					.addOption("bold", "Bold")
					.setValue(this.plugin.settings.labelFontWeight)
					.onChange(async (value) => {
						this.plugin.settings.labelFontWeight = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
