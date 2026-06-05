export class InfoOverlay {
    constructor() {
        this.initUI();
    }

    initUI() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'info-overlay';
        Object.assign(this.container.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(5px)',
            zIndex: '11000', // Above AdminPanel
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: '0',
            transition: 'opacity 0.3s'
        });

        // Create Panel
        this.panel = document.createElement('div');
        Object.assign(this.panel.style, {
            background: '#ffffff',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: '0',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            transform: 'scale(0.9)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
        });

        // Close Button
        const closeBtn = document.createElement('button');
        Object.assign(closeBtn.style, {
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0, 0, 0, 0.05)',
            color: '#374151',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: '10',
            transition: 'all 0.2s'
        });
        closeBtn.innerHTML = '&times;';
        closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(0, 0, 0, 0.1)'; };
        closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(0, 0, 0, 0.05)'; };
        closeBtn.onclick = () => this.hide();
        this.panel.appendChild(closeBtn);

        // Content Container
        this.content = document.createElement('div');
        this.content.style.padding = '32px';
        this.panel.appendChild(this.content);

        this.container.appendChild(this.panel);
        document.body.appendChild(this.container);

        // Click outside to close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
    }

    show(data) {
        if (!data) return;

        const title = data.title || data.label || 'Information';
        const description = data.description || 'No description available.';
        const image = data.target; // If we want to support image in info panel someday, using target as image url

        let html = `
            <h2 style="margin: 0 0 16px 0; font-family: 'Roboto', sans-serif; color: #111827; font-size: 24px; font-weight: 700;">${title}</h2>
            <div style="font-family: 'Roboto', sans-serif; color: #4b5563; line-height: 1.6; font-size: 16px;">
                ${description.replace(/\n/g, '<br>')}
            </div>
        `;

        if (image && (image.endsWith('.jpg') || image.endsWith('.png'))) {
            html = `
                <div style="width: 100%; height: 200px; background: #f3f4f6; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
                    <img src="${image}" style="width: 100%; height: 100%; object-fit: cover;" alt="${title}">
                </div>
             ` + html;
        }

        this.content.innerHTML = html;

        this.container.style.display = 'flex';
        // Trigger reflow
        this.container.offsetHeight;

        this.container.style.opacity = '1';
        this.panel.style.transform = 'scale(1)';
    }

    hide() {
        this.container.style.opacity = '0';
        this.panel.style.transform = 'scale(0.9)';

        setTimeout(() => {
            this.container.style.display = 'none';
        }, 300);
    }
}
