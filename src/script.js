const REFRESH_RATE = 60;
const INPUT_THRESHOLD = 0.05;
const BUTTON_THRESHOLD = 0.05;

const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const tickRateElement = document.getElementById("tick-rate");
const gamepadIdElement = document.getElementById("gamepad-id");
const buttonCountElement = document.getElementById("button-count");
const axisCountElement = document.getElementById("axis-count");
const mappingSelector = document.getElementById("mapping");
const vibrationTestButton = document.getElementById("vibration-test");
const vibrationStatus = document.getElementById("vibration-status");
const gamepadTabs = document.querySelectorAll(".gamepad-tab");

const buttonElements = [];
const buttonLabelElements = [];
const buttonValueElements = [];
const stickElements = [];
const stickValueElements = [];
const stickDotElements = [];

let running = true;
let updateInterval = null;
let activeGamepadIndex = null;
let uiGamepadIndex = null;
let uiGamepadId = null;
let buttonLabels = [];
let ticks = 0;
let tickRate = 0;
let lastTime = performance.now();
let activeMapping = "unknown";
let mappingMode = "auto";


for (let i = 0; i < 32; i++) {
    const element = document.getElementById(`button-${i}`);

    buttonElements.push(element);

    if (element) {
        buttonLabelElements.push(element.querySelector(".gamepad-button-label"));
        buttonValueElements.push(element.querySelector(".gamepad-button-value"));
    } else {
        buttonLabelElements.push(null);
        buttonValueElements.push(null);
    }
}

for (let i = 0; i < 2; i++) {
    const element = document.getElementById(`stick-${i}`);
    stickElements.push(element);

    if (element) {
        stickValueElements.push(element.querySelector(".gamepad-stick-values"));
        stickDotElements.push(element.querySelector(".gamepad-stick-dot"));
    } else {
        stickValueElements.push(null);
        stickDotElements.push(null);
    }
}

/*
 * Previous input state for each Gamepad slot.
 *
 * getGamepads() exposes four slots in this application:
 *
 *   0 -> Tab 1
 *   1 -> Tab 2
 *   2 -> Tab 3
 *   3 -> Tab 4
 *
 * A slot can still contain null when no controller is connected.
 */
const previousGamepadState = [
    null,
    null,
    null,
    null,
];

function updateVibrationUI(gamepad) {
    const available = !!gamepad?.vibrationActuator;
    vibrationTestButton.disabled = !available;
    vibrationStatus.textContent = available ? "Ready" : "Not available";
    vibrationStatus.classList.toggle("available", available);
}

function testVibration(gamepad) {
    if (!gamepad?.vibrationActuator) {
        console.log("No vibration actuator available");
        return;
    }

    gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 300,
        strongMagnitude: 1.0,
        weakMagnitude: 1.0,
    }).then(() => {
        console.log("Vibration triggered");
    }).catch((error) => {
        console.error("Vibration failed:", error);
    });
}

function detectMapping(gamepad) {
    console.log("gamepad id=" + gamepad.id);

    const id = gamepad.id.toLowerCase();

    // Nintendo Pro Controller
    if (id.includes("057e") && id.includes("2009") || id.includes("pro controller"))
        return "switch";

    // PlayStation detection (Name, "playstation", or Sony Vendor ID 054c)
    if (id.includes("playstation") || id.includes("054c") || id.includes("dualshock"))
        return "dualsense";

    if (id.includes("dualsense"))
        return "dualsense";

    if (id.includes("xbox") || id.includes("045e"))
        return "xbox";

    return "unknown";
}

function updateActiveTab() {
    for (const tab of gamepadTabs) {
        const index = Number(tab.dataset.gamepadIndex);
        tab.classList.toggle("active", index === activeGamepadIndex);
    }
}

function updateTabs() {
    const gamepads = navigator.getGamepads();
    const tabs = document.querySelectorAll(".gamepad-tab");

    tabs.forEach((tab) => {
        const index = Number(tab.dataset.gamepadIndex);
        const gamepad = gamepads[index];

        if (gamepad && gamepad.connected) {
            tab.classList.remove("disabled");
            tab.disabled = false;
        } else {
            tab.classList.add("disabled");
            tab.disabled = true;
        }
    });
}

function getGamepad(index) {
    if (index === null || index < 0 || index > 3)
        return null;

    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[index];

    if (!gamepad || !gamepad.connected)
        return null;

    return gamepad;
}


/*
 * Determine whether a gamepad has meaningful input.
 *
 * Buttons:
 *   A change greater than BUTTON_THRESHOLD counts.
 *
 * Sticks:
 *   Movement greater than INPUT_THRESHOLD counts.
 *
 * Small analog noise is therefore ignored.
 */
function hasChangingInput(gamepad) {
    const index = gamepad.index;

    if (index < 0 || index > 3)
        return false;

    const currentState = {
        buttons: [],
        axes: [],
    };

    //Store button values
    for (let i = 0; i < Math.min(gamepad.buttons.length, 32); i++)
        currentState.buttons.push(gamepad.buttons[i].value);

    // Only the four stick axes matter
    for (let i = 0; i < 4; i++)
        currentState.axes.push(gamepad.axes[i] ?? 0);

    const previousState = previousGamepadState[index];

    /*
     * First observation.
     *
     * Treat non-neutral input as activity. This means a controller
     * that is already being held when it appears can become active.
     */
    if (!previousState) {
        previousGamepadState[index] = currentState;

        for (const value of currentState.buttons)
            if (Math.abs(value) >= BUTTON_THRESHOLD)
                return true;

        for (const value of currentState.axes)
            if (Math.abs(value) >= INPUT_THRESHOLD)
                return true;

        return false;
    }

    // Check buttons
    const buttonCount = Math.max(currentState.buttons.length, previousState.buttons.length);

    for (let i = 0; i < buttonCount; i++) {
        const current = currentState.buttons[i] ?? 0;
        const previous = previousState.buttons[i] ?? 0;

        if (Math.abs(current - previous) >= BUTTON_THRESHOLD) {
            previousGamepadState[index] = currentState;
            return true;
        }
    }

    // Check the four stick axes
    for (let i = 0; i < 4; i++) {
        const current = currentState.axes[i] ?? 0;
        const previous = previousState.axes[i] ?? 0;

        if (Math.abs(current - previous) >= INPUT_THRESHOLD) {
            previousGamepadState[index] = currentState;
            return true;
        }
    }

    previousGamepadState[index] = currentState;

    return false;
}

function setActiveGamepad(index) {
    const gamepad = getGamepad(index);

    if (!gamepad) {
        // updateVibrationUI(null);
        return;
    }

    if (activeGamepadIndex === index)
        return;

    activeGamepadIndex = index;

    uiGamepadIndex = null;
    uiGamepadId = null;

    updateVibrationUI(gamepad);


    // New controller = automatic mapping detection
    mappingMode = "auto";
    activeMapping = "unknown";

    updateActiveTab();
    configureGamepadUI(gamepad);

    console.log("Active gamepad:", gamepad.id, "Index:", gamepad.index);
}



/*
 * Find input activity across all four gamepad slots.
 *
 * The first controller whose input changes becomes active.
 *
 * We iterate through all slots every tick so another controller
 * can take over immediately when it receives input.
 */
function findInputGamepad() {
    const gamepads = navigator.getGamepads();

    for (let i = 0; i < 4; i++) {
        const gamepad = gamepads[i];

        if (!gamepad || !gamepad.connected) {
            previousGamepadState[i] = null;
            continue;
        }

        if (hasChangingInput(gamepad)) {
            return gamepad;
        }
    }

    return null;
}

function hideUnusedInputs() {
    for (const element of buttonElements)
        if (element)
            element.classList.add("hidden");

    for (const element of stickElements)
        if (element)
            element.classList.add("hidden");
}

/*
 * Configure the static UI for the selected controller.
 *
 * This is only called when the controller or its mapping changes,
 * not on every polling tick.
 */

function configureGamepadUI(gamepad) {
    if (uiGamepadIndex === gamepad.index && uiGamepadId === gamepad.id)
        return;

    console.log("%c STATIC UI CONFIGURATION", "color: green; font-weight: bold;", "Gamepad:", gamepad.id, "Index:", gamepad.index);

    uiGamepadIndex = gamepad.index;
    uiGamepadId = gamepad.id;

    let mapping;

    if (mappingMode === "auto") {
        mapping = detectMapping(gamepad);
        activeMapping = mapping;

        console.log("mapping detected: " + mapping,);

        mappingSelector.value = "auto";
    } else {
        mapping = activeMapping;
        mappingSelector.value = activeMapping;
    }

    document.documentElement.setAttribute("data-theme", mapping);

    // Build button labels
    buttonLabels = [];

    for (let i = 0; i < gamepad.buttons.length; i++) {
        if (mapping === "xbox" && i < xbox_mapping.length && xbox_mapping[i] !== "")
            buttonLabels[i] = xbox_mapping[i];
        else if (mapping === "dualsense" && i < dualsense_mapping.length && dualsense_mapping[i] !== "")
            buttonLabels[i] = dualsense_mapping[i];
        else if (mapping === "switch" && i < switch_mapping.length && switch_mapping[i] !== "")
            buttonLabels[i] = switch_mapping[i];
        else
            buttonLabels[i] = `Button ${i}`;
    }

    // Gamepad information
    gamepadIdElement.textContent = gamepad.id;
    buttonCountElement.textContent = gamepad.buttons.length;
    axisCountElement.textContent = 4;

    // Configure buttons
    for (let i = 0; i < buttonElements.length; i++) {
        const element = buttonElements[i];
        const labelElement = buttonLabelElements[i];
        const valueElement = buttonValueElements[i];

        if (!element)
            continue;

        if (i < gamepad.buttons.length) {
            element.classList.remove("hidden");

            if (labelElement) {
                const labelText = buttonLabels[i];

                // Check if the label contains DualSense / PlayStation Unicode symbols
                if (/[✖〇☐△]/.test(labelText))
                    labelElement.innerHTML = labelText.replace(/([✖〇☐△])/g, '<span class="symbol">$1</span>');
                else
                    labelElement.textContent = labelText;
            }

            if (valueElement)
                valueElement.textContent = "0";

            element.style.setProperty("--button-value", "0%");
        } else
            element.classList.add("hidden");
    }

    for (let stick = 0; stick < stickElements.length; stick++) {
        const element = stickElements[stick];

        if (!element)
            continue;

        const xAxis = stick * 2;
        const yAxis = xAxis + 1;

        if (xAxis < 4 && yAxis < 4 && gamepad.axes.length >= 4) {
            element.classList.remove("hidden");

            if (stickValueElements[stick])
                stickValueElements[stick].textContent = "0.000, 0.000";

            if (stickDotElements[stick]) {
                stickDotElements[stick].style.left = "50%";
                stickDotElements[stick].style.top = "50%";
            }
        } else {
            element.classList.add("hidden");
        }
    }
}

function updateStick(stick, x, y) {
    const dot = stickDotElements[stick];
    const valueElement = stickValueElements[stick];

    if (!dot)
        return;

    const left = ((x + 1) / 2) * 100;
    const top = ((y + 1) / 2) * 100;

    dot.style.left = `${left}%`;
    dot.style.top = `${top}%`;

    if (valueElement)
        valueElement.textContent = `${x.toFixed(3)}, ${y.toFixed(3)}`;
}


// Update the visible controller UI
function updateGamepadDisplay(gamepad) {
    for (let i = 0; i < gamepad.buttons.length; i++) {
        const element = buttonElements[i];
        const valueElement = buttonValueElements[i];

        if (!element)
            continue;

        const rawValue = gamepad.buttons[i].value;
        const percentage = rawValue * 100;

        if (valueElement)
            valueElement.textContent = rawValue;

        element.style.setProperty("--button-value", `${percentage}%`);
    }

    // Left stick
    if (gamepad.axes.length >= 2)
        updateStick(0, gamepad.axes[0], gamepad.axes[1],);

    // Right stick.
    if (gamepad.axes.length >= 4)
        updateStick(1, gamepad.axes[2], gamepad.axes[3]);
}


// Main 60 Hz update loop.
function update() {
    if (!running)
        return;

    ticks++;

    // tick rate
    const now = performance.now();

    if (now - lastTime >= 1000) {
        tickRate = ticks;
        ticks = 0;
        lastTime = now;
    }

    // Check every gamepad slot for changing input
    const inputGamepad = findInputGamepad();

    if (inputGamepad)
        setActiveGamepad(inputGamepad.index);

    const activeGamepad = getGamepad(activeGamepadIndex);

    if (activeGamepad) {
        configureGamepadUI(activeGamepad);
        updateVibrationUI(activeGamepad);
        updateGamepadDisplay(activeGamepad);
    } else if (activeGamepadIndex !== null) {

        // Active controller disappeared
        activeGamepadIndex = null;
        uiGamepadIndex = null;
        uiGamepadId = null;
        buttonLabels = [];

        updateActiveTab();
        hideUnusedInputs();
        updateVibrationUI(null);

        gamepadIdElement.textContent = "Waiting...";
        buttonCountElement.textContent = "0";
        axisCountElement.textContent = "0";

        document.documentElement.removeAttribute("data-theme");
    }

    tickRateElement.textContent = `${tickRate} Hz`;
}

// Pause / Resume
toggle.addEventListener("click", () => {
    running = !running;

    if (running) {
        toggle.textContent = "Pause";
        status.textContent = "Running";
        status.classList.remove("paused");

        ticks = 0;
        tickRate = 0;
        lastTime = performance.now();

        tickRateElement.textContent = "0 Hz";
    } else {
        toggle.textContent = "Resume";
        status.textContent = "Paused";
        status.classList.add("paused");
        tickRateElement.textContent = "0 Hz";
    }
});

// Manual tab selection
gamepadTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        const index = Number(tab.dataset.gamepadIndex);
        const gamepad = getGamepad(index);

        if (!gamepad)
            return;

        setActiveGamepad(index);
    });
});

/*
 * Controller connected.
 *
 * We don't automatically make it active.
 *
 * The controller becomes active when:
 *   - the user clicks its tab, or
 *   - it produces meaningful input.
 */
window.addEventListener("gamepadconnected", (event) => {
    const gamepad = event.gamepad;

    if (gamepad.index < 0 || gamepad.index > 3)
        return;

    previousGamepadState[gamepad.index] = null;
    console.log("Gamepad connected:", gamepad.id, "Index:", gamepad.index);
    updateTabs();
});

// Controller disconnected
window.addEventListener("gamepaddisconnected", (event) => {
    const index = event.gamepad.index;

    if (index >= 0 && index < 4)
        previousGamepadState[index] = null;

    if (activeGamepadIndex === index) {
        activeGamepadIndex = null;
        uiGamepadIndex = null;
        uiGamepadId = null;

        buttonLabels = [];

        updateActiveTab();
        hideUnusedInputs();

        gamepadIdElement.textContent = "Waiting...";
        buttonCountElement.textContent = "0";
        axisCountElement.textContent = "0";
    }

    console.log("Gamepad disconnected:", event.gamepad);
    updateTabs();
});

/*
 * Mapping selector.
 *
 * Changing the mapping immediately updates
 * the currently selected controller.
 */
mappingSelector.addEventListener("change", () => {
    const gamepad = getGamepad(activeGamepadIndex);

    if (!gamepad)
        return;

    const selectedValue = mappingSelector.value;

    if (selectedValue === "auto") {
        // Restore automatic detection
        mappingMode = "auto";
        activeMapping = detectMapping(gamepad);
    } else {
        // User explicitly selected a manual mapping
        mappingMode = "manual";
        activeMapping = selectedValue;
    }

    // Force UI re-configuration
    uiGamepadIndex = null;
    configureGamepadUI(gamepad);
});

vibrationTestButton.addEventListener("click", () => {
    const gamepad = getGamepad(activeGamepadIndex);

    if (!gamepad?.vibrationActuator)
        return;


    gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 300,
        strongMagnitude: 1.0,
        weakMagnitude: 1.0
    }).then(() => {
        console.log("Vibration test triggered");
    }).catch((error) => {
        console.error("Vibration test failed:", error);
    });
});


// Initial state
hideUnusedInputs();
updateActiveTab();
updateTabs();

/*
 * Look for already-connected controllers.
 *
 * Browsers don't always fire gamepadconnected
 * if the page was loaded after the controller
 * was already connected.
 */
setTimeout(() => {
    const gamepads = navigator.getGamepads();

    for (let i = 0; i < 4; i++) {
        const gamepad = gamepads[i];

        if (gamepad && gamepad.connected) {
            console.log("Existing gamepad:", gamepad.id, "Index:", gamepad.index);
            previousGamepadState[i] = null;
        }
    }
}, 100);

// Start polling
updateInterval = setInterval(update, 1000 / REFRESH_RATE);
