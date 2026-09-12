package com.watabou.pixeldungeon.admin;

import com.watabou.noosa.BitmapText;
import com.watabou.pixeldungeon.scenes.PixelScene;
import com.watabou.pixeldungeon.ui.RedButton;
import com.watabou.pixeldungeon.ui.Window;

/** Общие помощники раскладки для окон админ-панели. */
class AdminWnd extends Window {

	static final int WIDTH      = 120;
	static final int BTN_HEIGHT = 18;
	static final int GAP        = 2;

	/** Текущая вертикальная позиция укладки внутри окна. */
	int pos = 0;

	BitmapText addTitle( String label ) {
		BitmapText title = PixelScene.createText( label, 9 );
		title.hardlight( Window.TITLE_COLOR );
		title.measure();
		title.x = PixelScene.align( (WIDTH - title.width()) / 2 );
		title.y = 2;
		add( title );
		pos = (int)(title.y + title.height()) + 4;
		return title;
	}

	BitmapText addLabel( String label, int color, float size ) {
		BitmapText text = PixelScene.createText( label, size );
		text.hardlight( color );
		text.measure();
		text.x = PixelScene.align( (WIDTH - text.width()) / 2 );
		text.y = pos;
		add( text );
		pos = (int)(text.y + text.height()) + GAP;
		return text;
	}

	/** Меняет текст строки и заново центрирует её по ширине окна. */
	static void center( BitmapText text, String label, int color ) {
		text.text( label );
		text.hardlight( color );
		text.measure();
		text.x = PixelScene.align( (WIDTH - text.width()) / 2 );
	}

	void addRow( RedButton button ) {
		add( button );
		button.setRect( 0, pos, WIDTH, BTN_HEIGHT );
		pos += BTN_HEIGHT + GAP;
	}

	void finish() {
		resize( WIDTH, pos - GAP );
	}
}
