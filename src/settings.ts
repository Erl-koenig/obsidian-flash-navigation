import { App, PluginSettingTab, Setting } from "obsidian";
import FlashNavigation from "./main";
import { DEFAULT_SETTINGS, CSS_CLASSES } from "./constants";

export class FlashSettingsTab extends PluginSettingTab {
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
			.setName("Auto toggle source-mode")
			.setDesc(
				"Automatically switches to source mode when entering flash mode, enabling navigation for all elements (callouts, tables, links, etc.). Only toggles source mode if it's not already active. Note: This can cause layout shifts, which can look weird.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSourceMode)
					.onChange(async (value) => {
						this.plugin.settings.autoSourceMode = value;
						await this.plugin.saveSettings();
					}),
			);

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
			.setName("Status bar position")
			.setDesc("The position of the status bar item")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left", "Left")
					.addOption("right", "Right")
					.setValue(this.plugin.settings.statusBarPosition)
					.onChange(async (value) => {
						this.plugin.settings.statusBarPosition = value as
							| "left"
							| "right";
						await this.plugin.saveSettings();
					}),
			);

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
			.setName("Replace next character")
			.setDesc(
				"Show jump labels over the next character instead of inserting them after matches. For example, when searching ‘tre’ in the string ‘tree’, the jump label displays as ‘tre[a]’ over the last ‘e’, not as ‘tre[a]e’.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.replaceChar)
					.onChange(async (value) => {
						this.plugin.settings.replaceChar = value;
						await this.plugin.saveSettings();
					}),
			);

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
