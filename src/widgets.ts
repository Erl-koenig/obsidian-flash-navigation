import { WidgetType } from "@codemirror/view";
import { CSS_CLASSES } from "./constants";

export class LabelWidget extends WidgetType {
	constructor(
		private label: string,
		private isQuestionMark: boolean = false,
		private isFocused: boolean = false,
		private isDimmed: boolean = false,
	) {
		super();
	}

	toDOM() {
		const span = createSpan();
		const classList: string[] = [CSS_CLASSES.LABEL];

		if (this.isQuestionMark) {
			classList.push(CSS_CLASSES.LABEL_QUESTION);
		}
		if (this.isFocused) {
			classList.push(CSS_CLASSES.LABEL_FOCUS);
		}
		if (this.isDimmed) {
			classList.push(CSS_CLASSES.DIM);
		}

		span.className = classList.join(" ");

		if (!this.isFocused && this.label.length > 1 && !this.isQuestionMark) {
			span.createSpan({
				cls: CSS_CLASSES.LABEL_PREFIX,
				text: this.label.slice(0, -1),
			});
			span.createSpan({
				cls: CSS_CLASSES.LABEL_TARGET,
				text: this.label.slice(-1),
			});
		} else {
			span.textContent = this.label;
		}

		return span;
	}

	eq(other: WidgetType): boolean {
		return (
			other instanceof LabelWidget &&
			other.label === this.label &&
			other.isQuestionMark === this.isQuestionMark &&
			other.isFocused === this.isFocused &&
			other.isDimmed === this.isDimmed
		);
	}
}
