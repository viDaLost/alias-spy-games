package com.shatteredpixel.shatteredpixeldungeon.admin;

import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;

/** Цифровая клавиатура, закрывающая доступ ко всем админ-функциям. */
public class WndAdminLogin extends AdminWnd {

	private static final int KEY_W   = 38;
	private static final int KEY_H   = 20;
	private static final int KEY_GAP = 3;

	private static final int MAX_LEN = 16;

	private static final String[] KEYS = {
		"1", "2", "3",
		"4", "5", "6",
		"7", "8", "9",
		"C", "0", "OK"
	};

	final StringBuilder entered = new StringBuilder();

	RenderedTextBlock display;
	RenderedTextBlock status;

	public WndAdminLogin() {
		addTitle( "ДОСТУП АДМИНА" );
		display = addLabel( "_", 0xFFFFFF, 9 );
		status = addLabel( "ВВЕДИТЕ ПАРОЛЬ", DIM, 7 );

		int top = pos + 1;
		for (int i = 0; i < KEYS.length; i++) {
			final String key = KEYS[i];
			place( new RedButton( key ) {
				@Override
				public void onClick() {
					press( key );
				}
			}, (i % 3) * (KEY_W + KEY_GAP), top + (i / 3) * (KEY_H + KEY_GAP), KEY_W, KEY_H );
		}

		pos = top + 4 * (KEY_H + KEY_GAP);
		finish();
	}

	void press( String key ) {
		if ("C".equals( key )) {
			entered.setLength( 0 );
			restate( status, "ВВЕДИТЕ ПАРОЛЬ", DIM );
		} else if ("OK".equals( key )) {
			if (AdminCore.unlock( entered.toString() )) {
				AdminCore.swap( this, new WndAdmin() );
				return;
			}
			entered.setLength( 0 );
			restate( status, "НЕВЕРНЫЙ ПАРОЛЬ", RED );
		} else if (entered.length() < MAX_LEN) {
			entered.append( key );
		}
		updateDisplay();
	}

	/** Показывает введённые цифры звёздочками. */
	private void updateDisplay() {
		StringBuilder masked = new StringBuilder();
		for (int i = 0; i < entered.length(); i++) {
			masked.append( '*' );
		}
		restate( display, masked.length() == 0 ? "_" : masked.toString(), 0xFFFFFF );
	}
}
