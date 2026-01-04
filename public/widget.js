/**
 * Chippy Chat Widget Loader
 * One-line embed: <script src="https://app.hellochippy.com/widget.js" data-chippy-id="YOUR_USER_ID"></script>
 */
(function () {
    'use strict';

    // Prevent double initialization
    if (window.ChippyWidget) return;
    window.ChippyWidget = { initialized: true };

    // Find the script tag and read configuration
    var scripts = document.getElementsByTagName('script');
    var currentScript = scripts[scripts.length - 1];

    // Also check for currentScript (modern browsers)
    if (document.currentScript) {
        currentScript = document.currentScript;
    }

    var userId = currentScript.getAttribute('data-chippy-id');
    var position = currentScript.getAttribute('data-position') || 'right';

    if (!userId) {
        console.error('[Chippy] Missing data-chippy-id attribute');
        return;
    }

    // Configuration
    var config = {
        userId: userId,
        position: position,
        baseUrl: currentScript.src.replace('/widget.js', ''),
        iframeId: 'chippy-widget-iframe'
    };

    // Create and inject the iframe
    function createWidget() {
        var iframe = document.createElement('iframe');
        iframe.id = config.iframeId;
        iframe.src = config.baseUrl + '/embed?u=' + encodeURIComponent(config.userId);
        iframe.allow = 'microphone; camera';
        iframe.setAttribute('loading', 'lazy');

        // Styling - widget is positioned fixed, transparent background
        var positionStyles = config.position === 'left'
            ? 'left: 0; right: auto;'
            : 'right: 0; left: auto;';

        iframe.style.cssText = [
            'position: fixed',
            'bottom: 0',
            positionStyles,
            'width: 400px',
            'height: 700px',
            'max-height: 90vh',
            'border: none',
            'background: transparent',
            'z-index: 2147483647', // Max z-index
            'pointer-events: auto',
            'transition: opacity 0.3s ease'
        ].join('; ');

        // Mobile responsive
        if (window.innerWidth <= 480) {
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.maxHeight = '100%';
            iframe.style.bottom = '0';
            iframe.style.right = '0';
            iframe.style.left = '0';
            iframe.style.borderRadius = '0';
        }

        document.body.appendChild(iframe);

        // Handle window resize for mobile
        window.addEventListener('resize', function () {
            var isMobile = window.innerWidth <= 480;
            if (isMobile) {
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.maxHeight = '100%';
                iframe.style.left = '0';
                iframe.style.right = '0';
                iframe.style.borderRadius = '0';
            } else {
                iframe.style.width = '400px';
                iframe.style.height = '700px';
                iframe.style.maxHeight = '90vh';
                if (config.position === 'left') {
                    iframe.style.left = '0';
                    iframe.style.right = 'auto';
                } else {
                    iframe.style.right = '0';
                    iframe.style.left = 'auto';
                }
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
    } else {
        createWidget();
    }
})();
