# gamepad-tester

An online Gamepad Tester for testing your controller inputs. Useful for detecting issues such as analog stick drift.

The Gamepad Tester uses the JavaScript Gamepad API to detect controllers and their standard button mappings.

<br/>

## Link

The only published version is available on my GitHub Pages site: https://amu2mod.github.io/gamepad-tester/

It contains no ads or trackers.

<br/>

## Build

This project uses a single HTML file to serve the online Gamepad Tester. The index.html file at the root of the project is generated from the HTML, CSS, and JavaScript source files located in src/.

On Windows, `PowerShell` and npm are used as build tools to generate the final index.html file.

Install the build dependency:

```powershell
npm.cmd install
````

Generate the unified index.html page:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
````

The generated `index.html` contains the HTML, CSS, and JavaScript from src/ and is used as the page published with GitHub Pages.

<br/>

## Minify

Minification is optional.

```powershell
npx.cmd --no-install html-minifier-terser .\index.html -o .\index.html --collapse-whitespace --remove-comments --minify-css --minify-js
````

This command overwrites index.html with the minified version.

<br/>

## Report a Bug or Issue

You can reach me at <amu2mod@gmail.com>.

