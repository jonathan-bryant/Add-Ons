const { createElement } = FrankerFaceZ.utilities.dom;
import STYLE_URL from './styles.scss';

class EmoteSidePanel extends Addon {

	getContainer() {
		return document.querySelector('.chat-list--default,.chat-list--other');
	}

	getPanel() {
		const panel = document.querySelector('#emote_side_panel');
		if (panel) return panel;

		const newPanel = createElement('div', {
			id: 'emote_side_panel',
			class: 'ffz--esp'
		});

		const container = this.getContainer();
		container.style.setProperty('position', 'relative');
		container.append(newPanel);

		if (this.settings.get('emote_side_panel.override_width')) {
			newPanel.style.width = `${this.settings.get('emote_side_panel.width_in_px')}px`;
		}

    return newPanel;
	}

	updatePadding() {
		// Had some problems changing the chat width, so for now i'll leave it fixed
		const padding = (this.emotes.length > 0) ? 50 : 50;
		this.getContainer().querySelector('.simplebar-content').style.setProperty('padding-right', `${padding}px`);
	}

	updateHighlight() {
		if (this.settings.get('emote_side_panel.highlight_max_count')) {
			let maxCountEmote = null;
			let maxCount = 0;

			for (const emote of this.emotes) {
				const emoteImage = emote.element.querySelector('img');
				if (emoteImage) {
					// Reset styles for all emotes
					emoteImage.style.maxHeight = 'unset';
					emoteImage.style.height = 'unset';
					emoteImage.style.maxwidth = 'unset';
					emoteImage.style.minWidth = 'unset';

					// Adjust the src to use the smallest version of the emote from the srcset based on 1X, 2X, and 4X
					const srcset = emoteImage.getAttribute('srcset');
					if (srcset) {
						const srcs = srcset.split(',');
						const src = srcs[0].split(' ')[0];
						if (emoteImage.src !== src) {
							emoteImage.src = src;
						}
					}

					// Find the emote with the maximum count
					if (emote.instances.length > maxCount && this.settings.get('emote_side_panel.sort_order') === 'none') {
						maxCount = emote.instances.length;
						maxCountEmote = emote;
					}
				}
			}

			if (this.settings.get('emote_side_panel.sort_order') === 'ascending') {
				maxCountEmote = this.emotes[this.emotes.length - 1];
			} else if (this.settings.get('emote_side_panel.sort_order') === 'descending') {
				maxCountEmote = this.emotes[0];
			}

			// Apply styles to the emote with the maximum count
			if (maxCountEmote) {
				const sizeIncrease = this.settings.get('emote_side_panel.size_increase');
				const emoteImage = maxCountEmote.element.querySelector('img');
				if (emoteImage) {
					emoteImage.style.maxwidth = `${sizeIncrease}px`;
					emoteImage.style.minWidth = `${sizeIncrease}px`;
					emoteImage.style.maxHeight = 'auto';
					emoteImage.style.height = `${sizeIncrease}px`;

					// Adjust the src to use the largest version of the emote from the srcset based on 1X, 2X, and 4X
					const srcset = emoteImage.getAttribute('srcset');
					if (srcset) {
						const srcs = srcset.split(',');
						const src = srcs[srcs.length - 1].split(' ')[0];
						if (emoteImage.src !== src) {
							emoteImage.src = src;
						}
					}
				}
			}
		}
	}

	updateCount(emote) {
		const len = emote.instances.length;
		emote.element.querySelector('span').innerHTML = ((len == 1) ? '' : `x${len}`);
	}

	updateElement(emote) {
		const panel = this.getPanel();
		const el = emote.element;
		if (panel.lastChild !== el && this.settings.get('emote_side_panel.sort_order') === 'none') {
			// Send emote to the end
			panel.removeChild(el);
			panel.appendChild(el);
			el.classList.add('animate')
			this.setRemoveAnimation(el);
		} else {
			el.classList.add('animate')
			this.setRemoveAnimation(el);
		}
		this.updateCount(emote);
	}

	updatePanel() {
		this.updateTimer = null;

		// Remove old stuff
		const limit = (new Date()).getTime() - (this.timeout * 1000);
		const panel = this.getPanel();
		for (let i = this.emotes.length - 1; i >= 0; i--) {
			const emote = this.emotes[i];
			emote.instances = emote.instances.filter(e => e.time > limit);
			if (emote.instances.length == 0) {
				panel.removeChild(emote.element);
				this.emotes.splice(i, 1);
			} else {
				this.updateCount(emote);
			}
		}

		// Sort emotes by count if the setting is enabled
		this.sortEmotes();

		this.updatePadding();
		this.setUpdatePanel();
	}

	sortEmotes() {
		const panel = this.getPanel();
		if (this.emotes.length > 1) {
			const sortOrder = this.settings.get('emote_side_panel.sort_order');
			if (sortOrder === 'ascending') {
				this.emotes.sort((a, b) => a.instances.length - b.instances.length);
			} else if (sortOrder === 'descending') {
				this.emotes.sort((a, b) => b.instances.length - a.instances.length);
			}

			if (sortOrder !== 'none') {
				// Remove all emotes from the panel
				while (panel.firstChild) {
					panel.removeChild(panel.firstChild);
				}

				// Add emotes back to the panel in the sorted order
				for (const emote of this.emotes) {
					panel.appendChild(emote.element);
				}
			}
		}
		this.updateHighlight();
	}

	setUpdatePanel() {
		if (!this.updateTimer) this.updateTimer = window.setTimeout(() => this.updatePanel(), 350);
	}

	createEmoteElement(emote) {
		return (<div class="animate">
			<span class="mult"></span>
			{this.chat.renderTokens([emote])}
		</div>)
	}

	clearEmotes() {
		this.emotes = [];
		this.getPanel().innerHTML = '';
	}

	setRemoveAnimation(el) {
		window.setTimeout(() => el.classList.remove('animate'), 200);
	}

	handleMessage(ctx, tokens, msg) {
		// Avoid handling the message twice
		if (msg.esp_handled) return tokens;
		msg.esp_handled = true;

		let emoteOnly = true;
		for (const token of tokens) {
			if ((token.type === 'emote') ||
				(token.type === 'text' && /^(\s|[^\x20-\x7E])+$/g.test(token.text))) continue;
			emoteOnly = false;
			break;
		}

		const captureAll = ctx.context.get('emote_side_panel.capture_all');
		if (!emoteOnly && !captureAll) return tokens;

		const keepEmoteMessages = ctx.context.get('emote_side_panel.keep_messages');
		if (emoteOnly && !keepEmoteMessages) msg.ffz_removed = true;

		// Add emotes to the list
		for (const token of tokens) {
			if (token.type === 'emote') {
				this.log.debug(token);
				const instance = { user: msg.user, time: msg.timestamp };
				const text = token.text;
				const el = this.emotes.find(e => e.text == text);
				if (el) {
					el.instances.push(instance);
					this.updateElement(el);
				} else {
					const el = this.createEmoteElement(token, 1);
					this.getPanel().appendChild(el);
					this.setRemoveAnimation(el);
					this.emotes.push({ text, element: el, firstTime: instance.timestamp, instances: [instance] });
				}
			}
		}

		this.updatePadding();
		this.sortEmotes();
		this.setUpdatePanel();

		return tokens;
	}

	constructor(...args) {
		super(...args);

		this.inject('chat');
		this.injectAs('site_chat', 'site.chat');

		this.settings.add('emote_side_panel.capture_all', {
			default: false,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Behaviour',
				title: 'Capture all',
				description: 'Capture emotes from all messages, even those that are not emote only',
				component: 'setting-check-box',
			},
		});

		this.settings.add('emote_side_panel.sort_order', {
			default: 'none',
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Appearance',
				title: 'Sort Order',
				description: 'Sort emotes by count',
				component: 'setting-select-box',
				data: [
					{ value: 'none', title: 'None' },
					{ value: 'ascending', title: 'Ascending' },
					{ value: 'descending', title: 'Descending' },
				],
			},
		});

		this.settings.add('emote_side_panel.keep_messages', {
			default: false,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Behaviour',
				title: 'Keep messages',
				description: 'Capture emotes but do not remove emote only messages',
				component: 'setting-check-box',
			},
		});

		this.settings.add('emote_side_panel.timeout', {
			default: 15,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Behaviour',
				title: 'Timeout',
				description: 'Time in seconds that the emote is visible on the side panel',
				component: 'setting-text-box',
			},
			changed: val => this.timeout = parseInt(val, 10) == 0 ? 30 : parseInt(val, 10)
		});

		this.settings.add('emote_side_panel.highlight_max_count', {
			default: false,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Appearance',
				title: 'Highlight Max Count',
				description: 'Highlight the emote with the highest count',
				component: 'setting-check-box',
			},
		});

		this.settings.add('emote_side_panel.size_increase', {
			default: 32,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Appearance',
				title: 'Size Increase',
				description: 'Set the increase in size for the highlighted emote in pixels',
				component: 'setting-text-box',
			},
		});

		this.settings.add('emote_side_panel.override_width', {
			default: false,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Appearance',
				title: 'Override Panel Width',
				description: 'Enable to set a custom width for the emote panel',
				component: 'setting-check-box',
			},
		});

		this.settings.add('emote_side_panel.width_in_px', {
			default: 32,
			ui: {
				path: 'Add-Ons > Emote Side Panel >> Appearance',
				title: 'Panel Width in Pixels',
				description: 'Set the width of the emote panel in pixels',
				component: 'setting-text-box',
			},
		});

		this.emotes = [];
		this.updateTimer = null;
		this.style_link = null;
		this.timeout = parseInt(this.settings.get('emote_side_panel.timeout'), 10);

		const outerThis = this;
		this.messageFilter = {
			type: 'emote_side_panel',
			priority: 9,
			process(tokens, msg) {
				return outerThis.handleMessage(this, tokens, msg)
			}
		}
	}

	onEnable() {
		this.on('site.router:route', this.clearEmotes, this);
		this.chat.addTokenizer(this.messageFilter);
		this.emit('chat:update-lines');

		if (!this.style_link)
			document.head.appendChild(this.style_link = createElement('link', {
				href: STYLE_URL,
				rel: 'stylesheet',
				type: 'text/css',
				crossOrigin: 'anonymous'
			}));
	}

	onDisable() {
		this.off('site.router:route', this.clearEmotes, this);
		this.chat.removeTokenizer(this.messageFilter);
		this.emit('chat:update-lines');
	}
}

EmoteSidePanel.register();
