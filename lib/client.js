window.__ModuleLoader__.load({
	id: "dsh-image-studio",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const Button = primitives.Button;
		const Tag = primitives.Tag;
		const Modal = primitives.Modal;
		const h = React.createElement;

		//#region 文案
		const zh = {
			title: "图片工作台",
			description: "管理图片工作台服务配置：点击方块切换当前使用，出图请求将使用当前配置。支持任意 OpenAI 兼容接口与模型。",
			add: "添加配置",
			addTitle: "添加配置",
			editTitle: "编辑配置",
			close: "关闭",
			cancel: "取消",
			save: "保存",
			saving: "保存中…",
			deleteProfile: "删除",
			unnamed: "未命名",
			noEndpoint: "未配置接口地址",
			noModel: "未指定模型",
			name: "名称",
			namePlaceholder: "例如：生产网关",
			baseUrl: "接口地址",
			baseUrlPlaceholder: "https://api.example.com/v1",
			apiKey: "API Key",
			apiKeyPlaceholder: "sk-…",
			apiKeySet: "已保存密钥",
			apiKeyUnset: "未保存密钥",
			keySaveFailed: "密钥保存失败，请重试",
			model: "模型",
			modelPlaceholder: "选择或输入模型 ID",
			fetchModels: "获取模型",
			fetching: "获取中…",
			pickModel: "选择模型…",
			modelsFound: "个模型可用",
			modelsImageHint: "其中 %n 个为图像模型，已置顶",
			outDir: "输出目录",
			outDirPlaceholder: "默认为工作目录下 /dsh_outputs/images",
			test: "测试连接",
			testing: "测试中…",
			ok: "连接正常",
			active: "使用中",
			never: "尚未添加配置。",
			needBaseUrl: "请先填写接口地址",
			localUnreachable: "无法连接到本地服务，请重启 DSH 后重试",
		};
		const en = {
			title: "Image generation",
			description: "Manage image-generation endpoints: click a tile to make it active; generation uses the active one. Works with any OpenAI-compatible endpoint and model.",
			add: "Add profile",
			addTitle: "Add profile",
			editTitle: "Edit profile",
			close: "Close",
			cancel: "Cancel",
			save: "Save",
			saving: "Saving…",
			deleteProfile: "Delete",
			unnamed: "Unnamed",
			noEndpoint: "No endpoint set",
			noModel: "No model set",
			name: "Name",
			namePlaceholder: "e.g. production gateway",
			baseUrl: "Endpoint",
			baseUrlPlaceholder: "https://api.example.com/v1",
			apiKey: "API key",
			apiKeyPlaceholder: "sk-…",
			apiKeySet: "Key saved",
			apiKeyUnset: "No key saved",
			keySaveFailed: "Saving the key failed; please retry",
			model: "Model",
			modelPlaceholder: "Select or enter a model ID",
			fetchModels: "Fetch models",
			fetching: "Fetching…",
			pickModel: "Select a model…",
			modelsFound: "models available",
			modelsImageHint: "%n are image models and come first",
			outDir: "Output directory",
			outDirPlaceholder: "Defaults to /dsh_outputs/images in the working directory",
			test: "Test connection",
			testing: "Testing…",
			ok: "Connection OK",
			active: "Active",
			never: "No profile yet.",
			needBaseUrl: "Fill the endpoint first",
			localUnreachable: "Cannot reach the local service; restart DSH and try again",
		};
		//#endregion

		//#region 样式（沿用 DSH 设置页的 design token）
		const css = [
			".dshig{display:flex;flex-direction:column;gap:10px}",
			".dshig_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}",
			".dshig_tile{display:flex;flex-direction:column;gap:6px;padding:12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:transparent;text-align:left;cursor:pointer;font:inherit;color:var(--dsw-alias-label-primary);min-width:0;transition:background .12s ease,border-color .12s ease}",
			".dshig_tile:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dshig_tile:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}",
			".dshig_tile_active{border-color:var(--dsw-alias-state-business-primary)}",
			".dshig_tile_add{align-items:center;justify-content:center;border-style:dashed;color:var(--dsw-alias-label-tertiary);min-height:104px}",
			".dshig_tile_head{display:flex;align-items:center;gap:6px;min-width:0}",
			".dshig_tile_name{flex:1;min-width:0;font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dshig_tile_line{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dshig_tile_foot{display:flex;align-items:center;gap:8px;margin-top:2px}",
			".dshig_link{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".dshig_link:hover{color:var(--dsw-alias-label-primary)}",
			".dshig_empty{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".dshig_field{display:flex;flex-direction:column;gap:6px;padding:8px 0}",
			".dshig_field + .dshig_field{border-top:0.5px solid var(--dsw-alias-border-l2)}",
			".dshig_head{display:flex;align-items:center;gap:8px}",
			".dshig_label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}",
			".dshig_badges{display:inline-flex;align-items:center;gap:8px;flex:none}",
			".dshig_input{height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);min-width:0;width:100%;box-sizing:border-box}",
			".dshig_input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}",
			".dshig_input::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".dshig_select{appearance:none;padding-right:28px;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary) 50%),linear-gradient(135deg,var(--dsw-alias-label-tertiary) 50%,transparent 50%);background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;background-size:5px 5px,5px 5px;background-repeat:no-repeat;cursor:pointer}",
			".dshig_select:disabled{cursor:default;opacity:.6}",
			".dshig_row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
			".dshig_grow{flex:1 1 180px;min-width:0}",
			".dshig_select_narrow{width:220px;flex:none}",
			".dshig_hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".dshig_ok{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
			".dshig_err{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}",
			".dshig_foot{display:flex;align-items:center;gap:8px;width:100%}",
			".dshig_spacer{flex:1;min-width:0}",
			".dshig_foot_status{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px}",
			".dshig_foot_status_err{color:var(--dsw-alias-state-error-primary)}",
			".dshig_primary{appearance:none;border:1px solid transparent;border-radius:var(--dsw-radius-md);padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
			".dshig_primary:disabled{opacity:.4;cursor:default}",
			".dshig_primary:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}",
			".dshig_cols{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}",
			".dshig_cols > .dshig_field{border-top:0}",
			".dshig_modal{width:700px;max-width:94vw}",
		].join("");
		const tagId = "dsh-image-studio/panel.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-image-studio";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		const NS = "settings.imageStudio";
		const ROUTE = "/dsh-image-studio";
		const ITEM_ID = "dsh-image-studio";

		async function callApi(path, body) {
			const res = await fetch(ROUTE + path, {
				method: body === undefined ? "GET" : "POST",
				headers: body === undefined ? {} : { "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			let payload;
			try {
				payload = await res.json();
			} catch {
				payload = { ok: false, message: "HTTP " + res.status };
			}
			return payload;
		}

		function newProfileId() {
			return "p-" + Math.random().toString(16).slice(2, 10);
		}

		function blankProfile() {
			const id = newProfileId();
			return {
				id,
				name: "",
				baseUrl: "",
				model: "",
				outDir: "",
				apiKeyRef: "IMAGE_STUDIO_KEY_" + id.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase(),
				hasKey: false,
				keyWritable: true,
			};
		}

		function hostOf(url) {
			const text = String(url || "").trim();
			if (!text) return "";
			try {
				return new URL(text).host;
			} catch {
				return text.replace(/^https?:\/\//i, "").split("/")[0];
			}
		}

		function field(key, label, control, headExtra) {
			return h("div", { className: "dshig_field", key }, [
				h("div", { className: "dshig_head", key: "head" }, [
					h("label", { className: "dshig_label", key: "label" }, label),
					headExtra ? h("span", { className: "dshig_badges", key: "extra" }, headExtra) : null,
				]),
				control,
			]);
		}

		function textInput(key, value, placeholder, onChange, type) {
			return h("input", {
				key,
				className: "dshig_input",
				type: type || "text",
				autoComplete: type === "password" ? "new-password" : undefined,
				value: value || "",
				placeholder: placeholder || "",
				onChange: (event) => onChange(event.target.value),
			});
		}

		/** 插件页里的「图片工作台」卡片：配置方块 + 弹窗编辑。 */
		function ImageStudioCard(props) {
			const { t } = props;
			const [data, setData] = React.useState(null);
			const [open, setOpen] = React.useState(false);
			const [form, setForm] = React.useState(null);
			const [isNew, setIsNew] = React.useState(false);
			const [models, setModels] = React.useState(null);
			const [test, setTest] = React.useState(null);
			const [keyText, setKeyText] = React.useState("");
			const [busy, setBusy] = React.useState("");
			const [notice, setNotice] = React.useState("");

			const load = React.useCallback(async () => {
				const result = await callApi("/state");
				if (result && result.ok) setData(result);
				else setNotice(t("localUnreachable"));
			}, [t]);

			React.useEffect(() => {
				load();
			}, [load]);

			if (props.view === "summary") return t("description");

			const profiles = (data && data.profiles) || [];
			const activeId = data && data.activeId;
			const modelOptions = models && models.ok && Array.isArray(models.models) ? models.models : [];
			const imageCount = modelOptions.filter((m) => m.image).length;

			const edit = (patch) => setForm((prev) => ({ ...(prev || {}), ...patch }));

			const persist = async (nextProfiles, nextActiveId) => {
				setBusy("save");
				try {
					const result = await callApi("/state", { profiles: nextProfiles, activeId: nextActiveId });
					if (result && result.ok) {
						setData(result);
						return true;
					}
					setNotice(t("localUnreachable"));
					return false;
				} finally {
					setBusy("");
				}
			};

			const switchTo = async (id) => {
				if (id === activeId) return;
				await persist(profiles, id);
			};

			const openNew = () => {
				setForm(blankProfile());
				setIsNew(true);
				setModels(null);
				setTest(null);
				setKeyText("");
				setNotice("");
				setOpen(true);
			};

			const openEdit = (profile) => {
				setForm({ ...profile });
				setIsNew(false);
				setModels(null);
				setTest(null);
				setKeyText("");
				setNotice("");
				setOpen(true);
			};

			const closeModal = () => {
				setOpen(false);
				setForm(null);
				setModels(null);
				setTest(null);
				setKeyText("");
				setNotice("");
			};

			const saveModal = async () => {
				if (!form) return;
				let saved = form;
				if (keyText.trim()) {
					setBusy("key");
					try {
						await props.saveKey(form.apiKeyRef, keyText.trim());
						saved = { ...form, hasKey: true };
						setKeyText("");
					} catch (error) {
						const detail = error && error.message ? error.message : "";
						setNotice(detail ? t("keySaveFailed") + "：" + detail : t("keySaveFailed"));
						setBusy("");
						return;
					}
				}
				const merged = isNew
					? profiles.concat(saved)
					: profiles.map((p) => (p.id === saved.id ? { ...p, ...saved } : p));
				const nextActive = isNew || !activeId ? saved.id : activeId;
				const ok = await persist(merged, nextActive);
				if (ok) closeModal();
			};

			const deleteModal = async () => {
				if (!form) return;
				const merged = profiles.filter((p) => p.id !== form.id);
				const nextActive = activeId === form.id ? (merged[0] ? merged[0].id : "") : activeId;
				const ok = await persist(merged, nextActive);
				if (ok) closeModal();
			};

			const doFetchModels = async () => {
				if (!form || !form.baseUrl) {
					setNotice(t("needBaseUrl"));
					return;
				}
				setBusy("models");
				setModels(null);
				setNotice("");
				try {
					setModels(await props.listModels({
						baseUrl: form.baseUrl,
						apiKeyRef: form.apiKeyRef,
						apiKey: keyText.trim() || undefined,
					}));
				} catch {
					setModels({ ok: false, code: "client", message: t("localUnreachable") });
				} finally {
					setBusy("");
				}
			};

			const doTest = async () => {
				if (!form || !form.baseUrl) {
					setNotice(t("needBaseUrl"));
					return;
				}
				setBusy("test");
				setTest(null);
				setNotice("");
				try {
					setTest(await props.testConnection({
						baseUrl: form.baseUrl,
						model: form.model,
						apiKeyRef: form.apiKeyRef,
						apiKey: keyText.trim() || undefined,
					}));
				} catch {
					setTest({ ok: false, code: "client", message: t("localUnreachable") });
				} finally {
					setBusy("");
				}
			};

			const tile = (profile) => {
				const active = profile.id === activeId;
				return h("div", {
					key: profile.id,
					className: "dshig_tile" + (active ? " dshig_tile_active" : ""),
					role: "button",
					tabIndex: 0,
					"aria-pressed": active,
					onClick: () => switchTo(profile.id),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							switchTo(profile.id);
						}
					},
				}, [
					h("div", { className: "dshig_tile_head", key: "head" }, [
						h("span", { className: "dshig_tile_name", key: "name" }, profile.name || t("unnamed")),
						active ? h(Tag, { key: "tag", tone: "neutral" }, t("active")) : null,
					]),
					h("p", { className: "dshig_tile_line", key: "host" }, hostOf(profile.baseUrl) || t("noEndpoint")),
					h("p", { className: "dshig_tile_line", key: "model" }, profile.model || t("noModel")),
					h("div", { className: "dshig_tile_foot", key: "foot" }, [
						h(Tag, { key: "key", tone: profile.hasKey ? "neutral" : "quiet" },
							profile.hasKey ? t("apiKeySet") : t("apiKeyUnset")),
						h("button", {
							key: "edit",
							type: "button",
							className: "dshig_link",
							onClick: (event) => {
								event.stopPropagation();
								openEdit(profile);
							},
						}, t("editTitle")),
					]),
				]);
			};

			const grid = h("div", { className: "dshig_grid", key: "grid" }, [
				...profiles.map(tile),
				h("button", { key: "__add", type: "button", className: "dshig_tile dshig_tile_add", onClick: openNew }, [
					h("span", { key: "plus", style: { fontSize: "18px", lineHeight: 1 } }, "+"),
					h("span", { key: "label", style: { fontSize: "12px" } }, t("add")),
				]),
			]);

			const modelsLine = models
				? (models.ok
					? h("p", { className: "dshig_ok", key: "ml" },
						modelOptions.length + " " + t("modelsFound")
						+ (imageCount ? "，" + t("modelsImageHint").replace("%n", String(imageCount)) : ""))
					: h("p", { className: "dshig_err", key: "ml" }, (models.message || "")))
				: null;

			const statusText = notice
				? notice
				: (test
					? (test.ok
						? "● " + t("ok") + " · " + test.latencyMs + "ms · " + (test.modelsCount || 0) + " " + t("modelsFound") + (test.note ? " · " + test.note : "")
						: "✕ " + (test.message || ""))
					: "");

			const modalBody = form ? h("div", { className: "dshig" }, [
				h("div", { className: "dshig_cols", key: "row1" }, [
					field("name", t("name"), textInput("nameInput", form.name, t("namePlaceholder"), (value) => edit({ name: value }))),
					field("outDir", t("outDir"), textInput("outDirInput", form.outDir, t("outDirPlaceholder"), (value) => edit({ outDir: value }))),
				]),
				field("baseUrl", t("baseUrl"),
					textInput("baseUrlInput", form.baseUrl, t("baseUrlPlaceholder"), (value) => edit({ baseUrl: value }))),
				field("apiKey", t("apiKey"),
					textInput("keyInput", keyText, t("apiKeyPlaceholder"), (value) => setKeyText(value), "password"),
					h(Tag, { key: "state", tone: form.hasKey ? "neutral" : "quiet" },
						form.hasKey ? t("apiKeySet") : t("apiKeyUnset"))),
				field("model", t("model"),
					h("div", { className: "dshig_row", key: "modelrow" }, [
						h("input", {
							key: "modelInput",
							className: "dshig_input dshig_grow",
							value: form.model || "",
							placeholder: t("modelPlaceholder"),
							onChange: (event) => edit({ model: event.target.value }),
						}),
						h("select", {
							key: "select",
							className: "dshig_input dshig_select dshig_select_narrow",
							value: "",
							disabled: modelOptions.length === 0,
							onChange: (event) => {
								if (event.target.value) edit({ model: event.target.value });
							},
						}, [
							h("option", { key: "", value: "" }, t("pickModel")),
							...modelOptions.map((m) => h("option", { key: m.id, value: m.id }, m.price ? m.id + "  ·  $" + m.price : m.id)),
						]),
						h(Button, {
							key: "fetch",
							size: "sm",
							onClick: doFetchModels,
							disabled: busy !== "" || !form.baseUrl,
						}, busy === "models" ? t("fetching") : t("fetchModels")),
					]),
					modelsLine),
			]) : null;

			const modalFooter = h("div", { className: "dshig_foot" }, [
				h(Button, { key: "del", size: "sm", onClick: deleteModal, disabled: busy !== "" || isNew }, t("deleteProfile")),
				h(Button, {
					key: "test",
					size: "sm",
					onClick: doTest,
					disabled: busy !== "" || !form || !form.baseUrl,
				}, busy === "test" ? t("testing") : t("test")),
				statusText
					? h("span", {
						key: "status",
						className: "dshig_foot_status" + (test && !test.ok && !notice ? " dshig_foot_status_err" : ""),
					}, statusText)
					: null,
				h("span", { key: "sp", className: "dshig_spacer" }),
				h(Button, { key: "cancel", size: "sm", onClick: closeModal }, t("cancel")),
				h("button", { key: "save", type: "button", className: "dshig_primary", onClick: saveModal, disabled: busy !== "" },
					busy === "save" || busy === "key" ? t("saving") : t("save")),
			]);

			return h("div", { className: "dshig" }, [
				profiles.length === 0 ? h("p", { className: "dshig_empty", key: "empty" }, t("never")) : null,
				grid,
				h(Modal, {
					key: "modal",
					open,
					onClose: closeModal,
					title: isNew ? t("addTitle") : t("editTitle"),
					closeLabel: t("close"),
					className: "dshig_modal",
					footer: modalFooter,
				}, modalBody),
			]);
		}

		const inject = ["slots", "locale", "remote", "remote.credentials"];

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "image-studio: dictionaries");
			ctx.effect(() => ctx.slots.inject("plugins.item", () => ctx.slots.register({
				name: "plugins.item",
				id: ITEM_ID,
				order: 30,
				label: () => t("title"),
				locale: NS,
				inject: () => ({
					listModels: (payload) => callApi("/models", payload),
					testConnection: (payload) => callApi("/test", payload),
					saveKey: async (ref, value) => {
						const result = await ctx.remote.credentials.set(ref, value);
						// 网关以 {ok:false, error} 汇报拒绝，而不是抛异常
						if (result && result.ok === false) {
							const reason = result.error && (result.error.message || result.error.code);
							throw new Error(reason || t("keySaveFailed"));
						}
						return { ok: true };
					},
				}),
			}, ImageStudioCard)), "image-studio: page");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
