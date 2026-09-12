package com.shatteredpixel.shatteredpixeldungeon.admin;

import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;

/** Общие помощники раскладки для окон админ-панели. */
class AdminWnd extends Window {

	static final int WIDTH      = 120;
	/** В ландшафте на интерфейс отводится 160 точек по высоте - строки низкие. */
	static final int BTN_HEIGHT = 16;
	static final int GAP        = 2;

	static final int GREEN = 0x44FF44;
	static final int RED   = 0xFF4444;
	static final int DIM   = 0xBBBBBB;

	/** Текущая вертикальная позиция укладки внутри окна. */
	int pos = 0;

	RenderedTextBlock addTitle( String label ) {
		RenderedTextBlock title = centered( label, Window.TITLE_COLOR, 9 );
		title.setPos( 0, 2 );
		add( title );
		pos = (int)(title.bottom()) + 4;
		return title;
	}

	RenderedTextBlock addLabel( String label, int color, int size ) {
		RenderedTextBlock text = centered( label, color, size );
		text.setPos( 0, pos );
		add( text );
		pos = (int)(text.bottom()) + GAP;
		return text;
	}

	/** Текст во всю ширину окна с выравниванием по центру. */
	private static RenderedTextBlock centered( String label, int color, int size ) {
		RenderedTextBlock text = PixelScene.renderTextBlock( label, size );
		text.maxWidth( WIDTH );
		text.align( RenderedTextBlock.CENTER_ALIGN );
		text.hardlight( color );
		return text;
	}

	/** Меняет текст строки; выравнивание по центру она держит сама. */
	static void restate( RenderedTextBlock text, String label, int color ) {
		text.text( label );
		text.hardlight( color );
	}

	void addRow( RedButton button ) {
		add( button );
		button.setRect( 0, pos, WIDTH, BTN_HEIGHT );
		pos += BTN_HEIGHT + GAP;
	}

	void place( RedButton button, float x, float y, float w, float h ) {
		add( button );
		button.setRect( x, y, w, h );
	}

	void finish() {
		resize( WIDTH, pos - GAP );
	}
}
