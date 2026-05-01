(function() {
    console.log('Theme Studio initializing...');

    const SUN_ICON = 'light_mode';
    const MOON_ICON = 'dark_mode';

    let currentThemeName = localStorage.getItem('sparky_theme_name') || 'rabbit';
    let currentLuminanceMode = localStorage.getItem('sparky_luminance_mode') || 'dark';
    let customTheme = null;
    try {
        const savedCustom = localStorage.getItem('sparky_custom_theme');
        if (savedCustom) customTheme = JSON.parse(savedCustom);
    } catch (e) {}

    let originalThemeState = { theme: currentThemeName, mode: currentLuminanceMode };
    let studioBaseColor = null;
    let studioActiveModifier = 'bold'; // Default modifier
    let currentHsl = { h: 0, s: 0, l: 0 };

    const CSS_COLOR_NAMES = ['AliceBlue','AntiqueWhite','Aqua','Aquamarine','Azure','Beige','Bisque','Black','BlanchedAlmond','Blue','BlueViolet','Brown','BurlyWood','CadetBlue','Chartreuse','Chocolate','Coral','CornflowerBlue','Cornsilk','Crimson','Cyan','DarkBlue','DarkCyan','DarkGoldenRod','DarkGray','DarkGreen','DarkKhaki','DarkMagenta','DarkOliveGreen','DarkOrange','DarkOrchid','DarkRed','DarkSalmon','DarkSeaGreen','DarkSlateBlue','DarkSlateGray','DarkTurquoise','DarkViolet','DeepPink','DeepSkyBlue','DimGray','DodgerBlue','FireBrick','FloralWhite','ForestGreen','Fuchsia','Gainsboro','GhostWhite','Gold','GoldenRod','Gray','Green','GreenYellow','HoneyDew','HotPink','IndianRed','Indigo','Ivory','Khaki','Lavender','LavenderBlush','LawnGreen','LemonChiffon','LightBlue','LightCoral','LightCyan','LightGoldenRodYellow','LightGray','LightGreen','LightPink','LightSalmon','LightSeaGreen','LightSkyBlue','LightSlateGray','LightSteelBlue','LightYellow','Lime','LimeGreen','Linen','Magenta','Maroon','MediumAquaMarine','MediumBlue','MediumOrchid','MediumPurple','MediumSeaGreen','MediumSlateBlue','MediumSpringGreen','MediumTurquoise','MediumVioletRed','MidnightBlue','MintCream','MistyRose','Moccasin','NavajoWhite','Navy','OldLace','Olive','OliveDrab','Orange','OrangeRed','Orchid','PaleGoldenRod','PaleGreen','PaleTurquoise','PaleVioletRed','PapayaWhip','PeachPuff','Peru','Pink','Plum','PowderBlue','Purple','RebeccaPurple','Red','RosyBrown','RoyalBlue','SaddleBrown','Salmon','SandyBrown','SeaGreen','SeaShell','Sienna','Silver','SkyBlue','SlateBlue','SlateGray','Snow','SpringGreen','SteelBlue','Tan','Teal','Thistle','Tomato','Turquoise','Violet','Wheat','White','WhiteSmoke','Yellow','YellowGreen'].sort();
    const STUDIO_MODIFIERS = ['None', 'Bold', 'Cool', 'Darker', 'Glow', 'Invert', 'Lighter', 'Metallic', 'Monochrome', 'Muted', 'Neon', 'Pastel', 'Vibrant', 'Vintage', 'Warm'];

    const getEl = (id) => document.getElementById(id);

    function triggerHaptic() {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }

    function formatColorNameForDisplay(name) {
        return name.replace(/([A-Z])/g, ' $1').trim();
    }

    async function applyTheme(themeIdentifier, silent = false, isConfirmation = false, manualHsl = null) {
        let themeColors;
        let friendlyName;
        let error = null;
        let themeToApply = { ...themeIdentifier };

        if (customTheme && (themeToApply.name === `custom:My Custom Theme` || themeToApply.name === 'My Custom Theme')) {
            if (customTheme.mode && customTheme.mode !== currentLuminanceMode) {
                await setLuminanceMode(customTheme.mode, true);
            }
            themeToApply.name = `custom:${customTheme.baseColor}`;
            themeToApply.modifier = customTheme.modifier;
            // Support saved manual adjustments
            if (customTheme.manualHsl) manualHsl = customTheme.manualHsl;
        }

        if (themeToApply.name && themeToApply.name.startsWith('custom:')) {
            const colorName = themeToApply.name.split(':')[1];
            const primaryRgb = window.colorNameToRgb ? window.colorNameToRgb(colorName) : null;
            
            if (!primaryRgb) {
                error = `'${colorName}' is not a valid color.`;
            } else {
                const activeMod = themeToApply.modifier === 'None' ? null : themeToApply.modifier;
                themeColors = window.generatePaletteFromRgb ? window.generatePaletteFromRgb(primaryRgb, currentLuminanceMode, activeMod, manualHsl) : null;
                if (!themeColors) {
                    error = currentLuminanceMode === 'dark' ? "This color is too dark." : "This color is too light.";
                } else {
                    friendlyName = colorName;
                    if (themeColors._hsl) currentHsl = themeColors._hsl;
                }
            }
        } else if (themeToApply.name === 'sparky') {
            themeColors = window.sparkyTheme ? (window.sparkyTheme[currentLuminanceMode] || window.sparkyTheme.dark) : null;
            friendlyName = 'Sparky';
        } else {
            themeColors = window.rabbitTheme ? (window.rabbitTheme[currentLuminanceMode] || window.rabbitTheme.dark) : null;
            friendlyName = 'Rabbit';
        }

        if (error || !themeColors) return { success: false, error: error };

        // ALWAYS apply to document element for live preview
        Object.entries(themeColors).forEach(([key, value]) => {
            if (!key.startsWith('_')) document.documentElement.style.setProperty(key, value);
        });

        if (isConfirmation) {
            currentThemeName = themeToApply.modifier ? `${themeToApply.name}:${themeToApply.modifier}` : themeToApply.name;
            localStorage.setItem('sparky_theme_name', currentThemeName);
            localStorage.setItem('sparky_luminance_mode', currentLuminanceMode);
            document.body.classList.toggle('light', currentLuminanceMode === 'light');
        } else {
            updateSliderUI();
        }
        return { success: true };
    }

    function updateSliderUI() {
        const hS = getEl('hueSlider');
        const sS = getEl('satSlider');
        const lS = getEl('lightSlider');
        if (hS && sS && lS) {
            // Small timeout ensures CSS variables have propagated to the DOM
            setTimeout(() => {
                console.log('Final Sync to Sliders:', currentHsl);
                hS.value = currentHsl.h;
                sS.value = currentHsl.s;
                lS.value = currentHsl.l;
                
                const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
                sS.style.background = `linear-gradient(to right, #444, ${accent})`;
            }, 50);
        }
    }

    async function setLuminanceMode(mode, silent = false) {
        if (currentLuminanceMode === mode) return;
        currentLuminanceMode = mode;
        localStorage.setItem('sparky_luminance_mode', mode);
        updateModeToggleUI();
        if (studioBaseColor) {
            await applyTheme({ name: `custom:${studioBaseColor}`, modifier: studioActiveModifier });
        } else {
            await applyTheme({ name: currentThemeName }, silent);
        }
    }

    function updateModeToggleUI() {
        const btn = getEl('themeModeToggleBtn');
        if (btn) btn.innerHTML = `<span class="material-symbols-outlined">${currentLuminanceMode === 'light' ? MOON_ICON : SUN_ICON}</span>`;
    }

    function renderThemeDialog() {
        const themeDialogOverlay = getEl('themeDialogOverlay');
        const themeColorList = getEl('themeColorList');
        const themeDialogTitle = getEl('themeDialogTitle');

        if (!themeDialogOverlay) return;
        themeDialogOverlay.style.display = 'flex';
        if (themeDialogTitle) themeDialogTitle.textContent = 'Theme Studio';

        // Auto-scroll to selected color
        setTimeout(() => {
            if (themeColorList && studioBaseColor) {
                const activeItem = themeColorList.querySelector(`[data-color-name="${studioBaseColor}"]`);
                if (activeItem) {
                    activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    activeItem.classList.add('selected');
                }
            }
        }, 100);

        // Prepare Studio Controls Container
        let studioContainer = getEl('themeStudioControls');
        if (!studioContainer) {
            studioContainer = document.createElement('div');
            studioContainer.id = 'themeStudioControls';
            studioContainer.className = 'theme-studio-controls';
            
            // Modifier Chips (Horizontal Scroll)
            const chipRow = document.createElement('div');
            chipRow.className = 'modifier-chip-row';
            STUDIO_MODIFIERS.forEach(mod => {
                const chip = document.createElement('button');
                chip.className = 'modifier-chip';
                chip.textContent = mod;
                chip.dataset.mod = mod;
                chip.onclick = async () => {
                    console.log(`Modifier Click: ${mod}`);
                    document.querySelectorAll('.modifier-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    studioActiveModifier = mod;
                    triggerHaptic();
                    if (studioBaseColor) {
                        const result = await applyTheme({ name: `custom:${studioBaseColor}`, modifier: studioActiveModifier });
                        if (result.success) updateSliderUI();
                    }
                };
                chipRow.appendChild(chip);
            });
            studioContainer.appendChild(chipRow);

            // HSL Sliders
            const sliderGroup = document.createElement('div');
            sliderGroup.className = 'slider-group';
            sliderGroup.innerHTML = `
                <div class="slider-row"><label class="slider-label">H</label><input type="range" id="hueSlider" class="theme-slider" min="0" max="360" value="0"></div>
                <div class="slider-row"><label class="slider-label">S</label><input type="range" id="satSlider" class="theme-slider" min="0" max="100" value="0"></div>
                <div class="slider-row"><label class="slider-label">L</label><input type="range" id="lightSlider" class="theme-slider" min="0" max="100" value="0"></div>
            `;
            studioContainer.appendChild(sliderGroup);
            
            themeColorList.parentNode.insertBefore(studioContainer, themeColorList.nextSibling);

            ['hueSlider', 'satSlider', 'lightSlider'].forEach(id => {
                getEl(id).addEventListener('input', () => {
                    currentHsl = {
                        h: parseInt(getEl('hueSlider').value),
                        s: parseInt(getEl('satSlider').value),
                        l: parseInt(getEl('lightSlider').value)
                    };
                    if (studioBaseColor) applyTheme({ name: `custom:${studioBaseColor}`, modifier: studioActiveModifier }, false, false, currentHsl);
                });
            });
        }

        // Reforce Active State on Open
        document.querySelectorAll('.modifier-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.mod === studioActiveModifier);
        });

        if (themeColorList) {
            themeColorList.innerHTML = '';
            const fragment = document.createDocumentFragment();
            if (customTheme) {
                const li = document.createElement('li');
                li.className = 'theme-color-item';
                li.innerHTML = `My Custom Theme <span class="favorite-indicator">★</span>`;
                li.dataset.colorName = customTheme.baseColor;
                li.dataset.isCustom = 'true';
                fragment.appendChild(li);
            }
            CSS_COLOR_NAMES.forEach(name => {
                const li = document.createElement('li');
                li.className = 'theme-color-item';
                li.innerHTML = `<span class="theme-swatch" style="background-color:${name}"></span><span>${formatColorNameForDisplay(name)}</span>`;
                li.dataset.colorName = name;
                fragment.appendChild(li);
            });
            themeColorList.appendChild(fragment);
        }

        const oldInput = getEl('themeDialogInput');
        if (oldInput && oldInput.parentElement) oldInput.parentElement.style.display = 'none';
        
        const okBtn = getEl('themeDialogOk');
        if (okBtn) okBtn.textContent = 'Ok';
        
        const saveBtn = getEl('themeDialogSave');
        if (saveBtn) saveBtn.textContent = 'Save Theme';

        const resetBtn = getEl('themeDialogReset');
        if (resetBtn) {
            const isCurrentlyRabbit = currentThemeName.toLowerCase().includes('rabbit');
            updateResetButtonUI(isCurrentlyRabbit ? 'sparky' : 'rabbit');
        }

        updateSliderUI();
    }





    function updateResetButtonUI(targetTheme) {
        const btn = getEl('themeDialogReset');
        if (!btn) return;
        const isSparky = targetTheme === 'sparky';
        btn.textContent = isSparky ? 'Sparky Me!' : 'Rabbit Me!';
    }

    function initListeners() {
        const themeBtn = getEl('themeBtn');
        if (themeBtn) themeBtn.addEventListener('click', () => {
            studioBaseColor = currentThemeName.split(':')[0].replace('custom:', '');
            studioActiveModifier = currentThemeName.includes(':') ? currentThemeName.split(':')[1] : 'Bold';
            renderThemeDialog();
        });

        getEl('themeColorList')?.addEventListener('click', async (e) => {
            const li = e.target.closest('.theme-color-item');
            if (!li) return;
            triggerHaptic();
            
            // Clear previous selection and set new one
            document.querySelectorAll('.theme-color-item').forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
            
            // Best Practice: Reset modifier to 'None' on base color selection to show pure palette
            studioActiveModifier = 'None';
            document.querySelectorAll('.modifier-chip').forEach(c => {
                c.classList.toggle('active', c.dataset.mod === 'None');
            });

            studioBaseColor = li.dataset.colorName;
            await applyTheme({ name: `custom:${studioBaseColor}`, modifier: studioActiveModifier });
        });

        getEl('themeDialogOk')?.addEventListener('click', async () => {
            if (studioBaseColor) {
                await applyTheme({ name: `custom:${studioBaseColor}`, modifier: studioActiveModifier }, false, true, currentHsl);
            }
            closeThemeDialog();
        });

        getEl('themeDialogCancel')?.addEventListener('click', () => closeThemeDialog(true));

        getEl('themeDialogReset')?.addEventListener('click', async () => {
            const label = getEl('themeDialogReset').textContent;
            const target = label.toLowerCase().includes('sparky') ? 'sparky' : 'rabbit';
            currentThemeName = target;
            studioBaseColor = null;
            studioActiveModifier = 'None';
            await applyTheme({ name: target }, false, true); // Confirmation=true to save globally
            updateResetButtonUI(target === 'rabbit' ? 'sparky' : 'rabbit');
            closeThemeDialog();
        });

        getEl('themeDialogSave')?.addEventListener('click', async () => {
            if (studioBaseColor) {
                customTheme = { baseColor: studioBaseColor, modifier: studioActiveModifier, mode: currentLuminanceMode, manualHsl: currentHsl };
                localStorage.setItem('sparky_custom_theme', JSON.stringify(customTheme));
                await applyTheme({ name: `custom:My Custom Theme` }, true, true);
                closeThemeDialog();
            }
        });

        getEl('themeModeToggleBtn')?.addEventListener('click', () => {
            triggerHaptic();
            setLuminanceMode(currentLuminanceMode === 'light' ? 'dark' : 'light');
        });

        document.addEventListener('click', (e) => {
            const overlay = getEl('themeDialogOverlay');
            if (overlay?.style.display === 'flex' && !e.target.closest('.custom-prompt-dialog') && !getEl('themeBtn').contains(e.target)) {
                closeThemeDialog(true);
            }
        });
    }

    async function closeThemeDialog(revert = false) {
        if (revert) await applyTheme({ name: originalThemeState.theme }, true, true);
        const overlay = getEl('themeDialogOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    window.initThemeUI = async () => {
        initListeners();
        await applyTheme({ name: currentThemeName }, true, true);
        updateModeToggleUI();
    };
})();
