import { WidgetType } from "@codemirror/view";
import { CSS_CLASSES } from "./constants";

export class LabelWidget extends WidgetType {
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
