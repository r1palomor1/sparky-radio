/**
 * UI Handling for the Theme Engine
 * Ported and adapted for Sparky Radio
 */

(function() {
    console.log('Theme UI script initializing...');

    // Icons (using Material Symbols names)
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
    let isStudioMode = false;
    let studioBaseColor = null;
    let studioActiveModifier = null;

    const CSS_COLOR_NAMES = ['AliceBlue','AntiqueWhite','Aqua','Aquamarine','Azure','Beige','Bisque','Black','BlanchedAlmond','Blue','BlueViolet','Brown','BurlyWood','CadetBlue','Chartreuse','Chocolate','Coral','CornflowerBlue','Cornsilk','Crimson','Cyan','DarkBlue','DarkCyan','DarkGoldenRod','DarkGray','DarkGreen','DarkKhaki','DarkMagenta','DarkOliveGreen','DarkOrange','DarkOrchid','DarkRed','DarkSalmon','DarkSeaGreen','DarkSlateBlue','DarkSlateGray','DarkTurquoise','DarkViolet','DeepPink','DeepSkyBlue','DimGray','DodgerBlue','FireBrick','FloralWhite','ForestGreen','Fuchsia','Gainsboro','GhostWhite','Gold','GoldenRod','Gray','Green','GreenYellow','HoneyDew','HotPink','IndianRed','Indigo','Ivory','Khaki','Lavender','LavenderBlush','LawnGreen','LemonChiffon','LightBlue','LightCoral','LightCyan','LightGoldenRodYellow','LightGray','LightGreen','LightPink','LightSalmon','LightSeaGreen','LightSkyBlue','LightSlateGray','LightSteelBlue','LightYellow','Lime','LimeGreen','Linen','Magenta','Maroon','MediumAquaMarine','MediumBlue','MediumOrchid','MediumPurple','MediumSeaGreen','MediumSlateBlue','MediumSpringGreen','MediumTurquoise','MediumVioletRed','MidnightBlue','MintCream','MistyRose','Moccasin','NavajoWhite','Navy','OldLace','Olive','OliveDrab','Orange','OrangeRed','Orchid','PaleGoldenRod','PaleGreen','PaleTurquoise','PaleVioletRed','PapayaWhip','PeachPuff','Peru','Pink','Plum','PowderBlue','Purple','RebeccaPurple','Red','RosyBrown','RoyalBlue','SaddleBrown','Salmon','SandyBrown','SeaGreen','SeaShell','Sienna','Silver','SkyBlue','SlateBlue','SlateGray','Snow','SpringGreen','SteelBlue','Tan','Teal','Thistle','Tomato','Turquoise','Violet','Wheat','White','WhiteSmoke','Yellow','YellowGreen'].sort();
    const STUDIO_MODIFIERS = ['Bold', 'Cool', 'Darker', 'Glow', 'Invert', 'Lighter', 'Metallic', 'Monochrome', 'Muted', 'Neon', 'Pastel', 'Vibrant', 'Vintage', 'Warm'];

    // DOM Elements
    const getEl = (id) => document.getElementById(id);

    function triggerHaptic() {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }

    function formatColorNameForDisplay(name) {
        return name.replace(/([A-Z])/g, ' $1').trim();
    }

    async function applyTheme(themeIdentifier, silent = false, isConfirmation = false) {
        console.log(`Applying theme: ${themeIdentifier.name} (Conf: ${isConfirmation})`);
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
        }

        if (themeToApply.name && themeToApply.name.startsWith('custom:')) {
            const themeParts = themeToApply.name.split(':');
            const colorName = themeParts[1];
            const modifierFromName = themeParts.length > 2 ? themeParts[2] : null;
            const primaryRgb = window.colorNameToRgb ? window.colorNameToRgb(colorName) : null;
            
            if (!primaryRgb) {
                error = `'${colorName}' is not a valid color.`;
            } else {
                themeColors = window.generatePaletteFromRgb ? window.generatePaletteFromRgb(primaryRgb, currentLuminanceMode, themeToApply.modifier || modifierFromName) : null;
                if (!themeColors) {
                    error = currentLuminanceMode === 'dark' ? "This color is too dark." : "This color is too light.";
                } else {
                    friendlyName = colorName;
                }
            }
        } else if (themeToApply.name === 'sparky') {
            themeColors = window.sparkyTheme ? (window.sparkyTheme[currentLuminanceMode] || window.sparkyTheme.dark) : null;
            friendlyName = 'Sparky';
        } else {
            themeColors = window.rabbitTheme ? (window.rabbitTheme[currentLuminanceMode] || window.rabbitTheme.dark) : null;
            friendlyName = 'Rabbit';
        }

        if (error) {
            console.error(`Theme Error: ${error}`);
            return { success: false, error: error };
        }
        if (!themeColors) {
            console.warn('No theme colors generated.');
            return { success: true };
        }

        const finalThemeName = themeToApply.modifier ? `${themeToApply.name}:${themeToApply.modifier}` : themeToApply.name;
        
        if (isConfirmation) {
            Object.entries(themeColors).forEach(([key, value]) => {
                document.documentElement.style.setProperty(key, value);
            });
            currentThemeName = finalThemeName;
            localStorage.setItem('sparky_theme_name', currentThemeName);
            localStorage.setItem('sparky_luminance_mode', currentLuminanceMode);
            
            document.body.classList.toggle('light', currentLuminanceMode === 'light');
            const toggleTrack = getEl('toggleTrack');
            if (toggleTrack) toggleTrack.classList.toggle('on', currentLuminanceMode === 'light');
            
            if (!silent) console.log(`Theme PERSISTED: ${friendlyName}`);
        } else {
            const themeDialogOverlay = getEl('themeDialogOverlay');
            if (themeDialogOverlay && themeColors) {
                Object.entries(themeColors).forEach(([key, value]) => {
                    themeDialogOverlay.style.setProperty(key, value);
                });
                console.log('Theme preview applied to overlay.');
            }
        }
        return { success: true };
    }

    async function setLuminanceMode(mode, silent = false) {
        console.log(`Setting luminance mode: ${mode}`);
        if (currentLuminanceMode === mode) return;
        currentLuminanceMode = mode;
        localStorage.setItem('sparky_luminance_mode', mode);
        updateModeToggleUI();
        updateThemeListDisabledState();

        if (isStudioMode) {
            await updateStudioPreview();
        } else {
            await applyTheme({ name: currentThemeName }, silent);
        }
    }

    function updateModeToggleUI() {
        const themeModeToggleBtn = getEl('themeModeToggleBtn');
        if (!themeModeToggleBtn) return;
        const icon = currentLuminanceMode === 'light' ? MOON_ICON : SUN_ICON;
        themeModeToggleBtn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
    }

    function updateThemeListDisabledState() {
        const themeColorList = getEl('themeColorList');
        if (!themeColorList) return;
        const listItems = themeColorList.querySelectorAll('.theme-color-item');
        listItems.forEach(item => {
            const colorName = item.dataset.colorName;
            if (colorName) {
                const rgb = window.colorNameToRgb ? window.colorNameToRgb(colorName) : null;
                item.classList.toggle('disabled', !rgb || !window.generatePaletteFromRgb(rgb, currentLuminanceMode));
            }
        });
    }

    function renderThemeDialog() {
        console.log('Rendering Theme Dialog...');
        const themeDialogOverlay = getEl('themeDialogOverlay');
        const themeDialogInput = getEl('themeDialogInput');
        const themeDialogTitle = getEl('themeDialogTitle');
        const themeDialogOk = getEl('themeDialogOk');
        const themeDialogCancel = getEl('themeDialogCancel');
        const themeDialogReset = getEl('themeDialogReset');
        const themeDialogError = getEl('themeDialogError');
        const clearThemeInputBtn = getEl('clearThemeInputBtn');
        const themeColorList = getEl('themeColorList');

        if (!themeDialogOverlay) {
            console.error('CRITICAL: themeDialogOverlay NOT FOUND in DOM!');
            return;
        }

        themeDialogOverlay.style.display = 'flex';
        console.log('themeDialogOverlay display set to flex.');

        if (themeDialogTitle) themeDialogTitle.textContent = 'Change Theme';

        if (themeDialogInput) {
            themeDialogInput.value = '';
            themeDialogInput.parentElement.style.display = 'block';
        }
        if (themeDialogError) themeDialogError.textContent = '';
        if (clearThemeInputBtn) clearThemeInputBtn.style.display = 'none';
        if (themeColorList) {
            themeColorList.innerHTML = '';
            themeColorList.scrollTop = 0;
            const fragment = document.createDocumentFragment();

            if (isStudioMode) {
                if (themeDialogTitle) themeDialogTitle.textContent = 'Apply Modifier';
                if (themeDialogOk) themeDialogOk.textContent = 'Save';
                if (themeDialogCancel) themeDialogCancel.textContent = 'Back';
                if (themeDialogReset) themeDialogReset.style.display = 'none';
                if (themeDialogInput) themeDialogInput.parentElement.style.display = 'none';
                STUDIO_MODIFIERS.forEach(name => {
                    const li = document.createElement('li');
                    li.className = 'theme-color-item';
                    li.textContent = name;
                    li.dataset.modifierName = name;
                    fragment.appendChild(li);
                });
            } else {
                if (themeDialogTitle) themeDialogTitle.textContent = 'Change Theme';
                if (themeDialogOk) themeDialogOk.textContent = 'OK';
                if (themeDialogCancel) themeDialogCancel.textContent = 'Cancel';
                if (themeDialogReset) themeDialogReset.style.display = 'block';
                
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
                    
                    const swatch = document.createElement('span');
                    swatch.className = 'theme-swatch';
                    swatch.style.backgroundColor = name;
                    
                    const label = document.createElement('span');
                    label.textContent = formatColorNameForDisplay(name);
                    
                    li.appendChild(swatch);
                    li.appendChild(label);
                    li.dataset.colorName = name;
                    fragment.appendChild(li);
                });
            }
            themeColorList.appendChild(fragment);
            themeColorList.focus();
            console.log(`Rendered ${themeColorList.children.length} colors.`);
        }
    }

    async function updateStudioPreview() {
        if (!isStudioMode || !studioBaseColor) return;
        const themeToApply = { name: `custom:${studioBaseColor}`, modifier: studioActiveModifier || 'bold' };
        const applyResult = await applyTheme(themeToApply, false);
        const themeDialogError = getEl('themeDialogError');
        if (applyResult && !applyResult.success && themeDialogError) {
            themeDialogError.textContent = applyResult.error;
        }
    }

    function updateResetButtonUI(targetTheme) {
        const themeDialogReset = getEl('themeDialogReset');
        if (!themeDialogReset) return;
        if (targetTheme === 'rabbit') {
            themeDialogReset.textContent = 'Rabbit Me!';
            themeDialogReset.style.backgroundColor = '#ff7043';
            themeDialogReset.style.color = 'white';
        } else {
            themeDialogReset.textContent = 'Sparky Me!';
            themeDialogReset.style.backgroundColor = '#00f2ff';
            themeDialogReset.style.color = 'black';
        }
    }

    function updateModifierSelectionUI() {
        const themeColorList = getEl('themeColorList');
        if (!themeColorList) return;
        const listItems = themeColorList.querySelectorAll('.theme-color-item');
        listItems.forEach(item => {
            item.classList.toggle('selected', item.dataset.modifierName?.toLowerCase() === studioActiveModifier);
        });
    }

    function filterThemeList(query) {
        const themeColorList = getEl('themeColorList');
        if (!themeColorList) return;
        const lowerCaseQuery = query.trim().toLowerCase().replace(/\s+/g, '');
        const listItems = themeColorList.querySelectorAll('.theme-color-item');
        const noMatchesEl = themeColorList.querySelector('.no-matches-message');
        if (noMatchesEl) noMatchesEl.remove();

        let visibleCount = 0;
        listItems.forEach(item => {
            const isVisible = !lowerCaseQuery || (item.dataset.colorName || item.dataset.modifierName || '').toLowerCase().includes(lowerCaseQuery);
            item.style.display = isVisible ? 'block' : 'none';
            if (isVisible) visibleCount++;
        });

        if (visibleCount === 0 && listItems.length > 0) {
            const li = document.createElement('li');
            li.className = 'no-matches-message';
            li.textContent = `No matches for "${query}"`;
            themeColorList.appendChild(li);
        }
    }

    function openThemeEditor() {
        console.log('--- OPEN THEME EDITOR TRIGGERED ---');
        isStudioMode = false;
        studioBaseColor = null;
        studioActiveModifier = null;
        originalThemeState = { theme: currentThemeName, mode: currentLuminanceMode };
        const themeLabToggle = getEl('themeLabToggle');
        const themeDialogTitle = getEl('themeDialogTitle');
        const labCheckbox = getEl('lab-checkbox');
        if (themeLabToggle) themeLabToggle.style.display = 'none';
        if (themeDialogTitle) themeDialogTitle.parentElement.classList.remove('lab-toggle-active');
        if (labCheckbox) labCheckbox.checked = false;
        renderThemeDialog();
        updateModeToggleUI();
        updateThemeListDisabledState();
        // Set initial button label (show the one that isn't active)
        updateResetButtonUI(currentThemeName === 'rabbit' ? 'sparky' : 'rabbit');
    }

    async function closeThemeDialog(shouldRevert = false) {
        console.log(`Closing theme dialog (Revert: ${shouldRevert})`);
        if (shouldRevert && (currentLuminanceMode !== originalThemeState.mode || currentThemeName !== originalThemeState.theme)) {
            await setLuminanceMode(originalThemeState.mode, true);
            await applyTheme({ name: originalThemeState.theme }, true, true);
        }
        const themeDialogOverlay = getEl('themeDialogOverlay');
        if (themeDialogOverlay) themeDialogOverlay.style.display = 'none';
    }

    function initListeners() {
        const themeBtn = getEl('themeBtn');
        const themeDialogInput = getEl('themeDialogInput');
        const themeDialogOverlay = getEl('themeDialogOverlay');
        const clearThemeInputBtn = getEl('clearThemeInputBtn');
        const themeColorList = getEl('themeColorList');
        const themeDialogOk = getEl('themeDialogOk');
        const themeDialogCancel = getEl('themeDialogCancel');
        const themeDialogReset = getEl('themeDialogReset');
        const themeModeToggleBtn = getEl('themeModeToggleBtn');
        const labCheckbox = getEl('lab-checkbox');

        if (themeBtn) {
            themeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openThemeEditor();
            });
            console.log('Theme button listener attached.');
        } else {
            console.error('Theme button NOT FOUND!');
        }

        if (themeDialogInput) {
            themeDialogInput.addEventListener('input', () => {
                const query = themeDialogInput.value;
                if (clearThemeInputBtn) clearThemeInputBtn.style.display = query.length > 0 ? 'flex' : 'none';
                const themeDialogError = getEl('themeDialogError');
                if (themeDialogError && themeDialogError.textContent) themeDialogError.textContent = '';
                filterThemeList(query);
            });
            themeDialogInput.addEventListener('focus', () => themeDialogOverlay?.classList.add('input-focused'));
            themeDialogInput.addEventListener('blur', () => themeDialogOverlay?.classList.remove('input-focused'));
        }

        if (clearThemeInputBtn) {
            clearThemeInputBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
                if (themeDialogInput) {
                    themeDialogInput.value = '';
                    clearThemeInputBtn.style.display = 'none';
                    filterThemeList('');
                    triggerHaptic();
                    themeDialogInput.focus();
                }
            });
        }

        if (themeColorList) {
            themeColorList.addEventListener('click', async (e) => {
                const li = e.target.closest('.theme-color-item');
                if (!li || li.classList.contains('disabled')) return;
                triggerHaptic();
                const themeDialogError = getEl('themeDialogError');
                if (themeDialogError) themeDialogError.textContent = '';

                if (isStudioMode) {
                    studioActiveModifier = li.dataset.modifierName.toLowerCase();
                    const displayModifier = studioActiveModifier.charAt(0).toUpperCase() + studioActiveModifier.slice(1);
                    const themeDialogTitle = getEl('themeDialogTitle');
                    if (themeDialogTitle) themeDialogTitle.textContent = `${displayModifier} ${studioBaseColor}`;
                    updateModifierSelectionUI();
                    await updateStudioPreview();
                } else {
                    const colorName = li.dataset.colorName;
                    if (li.dataset.isCustom && customTheme) {
                        if (themeDialogInput) themeDialogInput.value = 'My Custom Theme';
                    } else {
                        if (themeDialogInput) themeDialogInput.value = colorName;
                    }
                    // Reset the toggle button label to a safe default when a specific color is picked
                    updateResetButtonUI('sparky');
                    const themeToPreview = li.dataset.isCustom ? { name: `custom:My Custom Theme` } : { name: `custom:${colorName}` };
                    const applyResult = await applyTheme(themeToPreview);
                    if (!applyResult.success && themeDialogError) themeDialogError.textContent = applyResult.error;
                    
                    const themeLabToggle = getEl('themeLabToggle');
                    if (themeLabToggle) {
                        const themeDialogTitle = getEl('themeDialogTitle');
                        const wrapper = themeDialogTitle ? themeDialogTitle.parentElement : null;
                        if (li.dataset.isCustom) {
                            themeLabToggle.style.display = 'none';
                            wrapper.classList.remove('lab-toggle-active');
                        } else {
                            themeLabToggle.style.display = 'flex';
                            wrapper.classList.add('lab-toggle-active');
                        }
                    }
                }
                if (clearThemeInputBtn && themeDialogInput) clearThemeInputBtn.style.display = themeDialogInput.value.length > 0 ? 'flex' : 'none';
            });
        }

        if (themeDialogOk) {
            themeDialogOk.addEventListener('click', async () => {
                if (isStudioMode) {
                    if (studioBaseColor) {
                        customTheme = { baseColor: studioBaseColor, modifier: studioActiveModifier || 'bold', mode: currentLuminanceMode };
                        localStorage.setItem('sparky_custom_theme', JSON.stringify(customTheme));
                        isStudioMode = false;
                        await applyTheme({ name: 'custom:My Custom Theme' }, true, true);
                        closeThemeDialog();
                    } else {
                        const themeDialogError = getEl('themeDialogError');
                        if (themeDialogError) themeDialogError.textContent = 'Error: No base color selected.';
                    }
                } else {
                    const themeDialogInput = getEl('themeDialogInput');
                    let themeName = themeDialogInput ? themeDialogInput.value.trim() : currentThemeName;
                    
                    // Format correctly for applyTheme
                    const lowerTheme = themeName.toLowerCase();
                    if (themeName && !themeName.startsWith('custom:') && lowerTheme !== 'rabbit' && lowerTheme !== 'sparky') {
                        themeName = `custom:${themeName}`;
                    }
                    
                    triggerHaptic();
                    const applyResult = await applyTheme({ name: themeName }, false, true);
                    if (applyResult.success) {
                        closeThemeDialog();
                    } else {
                        const themeDialogError = getEl('themeDialogError');
                        if (themeDialogError) themeDialogError.textContent = applyResult.error;
                    }
                }
            });
        }

        if (themeDialogCancel) {
            themeDialogCancel.addEventListener('click', async () => {
                if (isStudioMode) {
                    if (labCheckbox) labCheckbox.checked = false;
                    isStudioMode = false;
                    studioActiveModifier = null;
                    renderThemeDialog();
                    const themeLabToggle = getEl('themeLabToggle');
                    if (themeLabToggle) themeLabToggle.style.display = 'none';
                    await applyTheme({ name: `custom:${studioBaseColor}` });
                } else {
                    isStudioMode = false;
                    closeThemeDialog(true);
                }
            });
        }

        if (themeDialogReset) {
            themeDialogReset.addEventListener('click', async () => {
                triggerHaptic();
                // Get target from current button text
                const currentLabel = themeDialogReset.textContent;
                const targetTheme = currentLabel.toLowerCase().includes('sparky') ? 'sparky' : 'rabbit';
                const nextTheme = targetTheme === 'rabbit' ? 'sparky' : 'rabbit';
                
                const themeDialogInput = getEl('themeDialogInput');
                if (themeDialogInput) themeDialogInput.value = targetTheme;
                
                await applyTheme({ name: targetTheme }, false, false); // Preview only
                updateResetButtonUI(nextTheme);
            });
        }

        if (themeModeToggleBtn) {
            themeModeToggleBtn.addEventListener('click', async () => {
                triggerHaptic();
                const newMode = currentLuminanceMode === 'light' ? 'dark' : 'light';
                await setLuminanceMode(newMode);
            });
        }

        if (labCheckbox) {
            labCheckbox.addEventListener('change', async () => {
                const themeDialogInput = getEl('themeDialogInput');
                if (labCheckbox.checked) {
                    isStudioMode = true;
                    studioBaseColor = themeDialogInput ? themeDialogInput.value.trim() : null;
                    studioActiveModifier = 'bold';
                    renderThemeDialog();
                    if (themeDialogInput) themeDialogInput.value = studioBaseColor;
                    updateModifierSelectionUI();
                    await updateStudioPreview();
                } else {
                    isStudioMode = false;
                    studioActiveModifier = null;
                    renderThemeDialog();
                    const themeLabToggle = getEl('themeLabToggle');
                    if (themeLabToggle) themeLabToggle.style.display = 'flex';
                    if (studioBaseColor) await applyTheme({ name: `custom:${studioBaseColor}` });
                }
            });
        }

        document.addEventListener('click', (e) => {
            const themeDialogOverlay = getEl('themeDialogOverlay');
            const themeBtn = getEl('themeBtn');
            if (themeDialogOverlay && themeDialogOverlay.style.display === 'flex' && !e.target.closest('.custom-prompt-dialog') && !themeBtn.contains(e.target)) {
                closeThemeDialog(true);
            }
        });
    }

    // Initialization
    window.initThemeEngine = async () => {
        console.log('initThemeEngine called');
        initListeners();
        await applyTheme({ name: currentThemeName }, true, true);
        updateModeToggleUI();
    };

    // Expose for debugging
    window.openThemeEditor = openThemeEditor;

})();
