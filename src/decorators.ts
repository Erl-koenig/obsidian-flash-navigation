import { StateField, StateEffect, Range } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";

export const addDimEffect = StateEffect.define<Range<Decoration>[]>();
export const addMatchEffect = StateEffect.define<Range<Decoration>[]>();
export const addLabelEffect = StateEffect.define<Range<Decoration>[]>();
export const clearAllEffect = StateEffect.define();

export const flashDecorationField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, transaction) {
		decorations = decorations.map(transaction.changes);

		for (const effect of transaction.effects) {
			if (effect.is(clearAllEffect)) {
				return Decoration.none;
			}

			if (
				effect.is(addDimEffect) ||
				effect.is(addMatchEffect) ||
				effect.is(addLabelEffect)
			) {
				decorations = decorations.update({
					add: effect.value,
					sort: true,
				});
			}
		}

		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});
