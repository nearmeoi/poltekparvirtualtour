export const AdminFormBuilder = {
    createInput({ label, value = '', placeholder = '', onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener('input', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(input);
        return wrapper;
    },

    createButton({ text, onClick, variant = 'default' }) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className   = `admin-btn admin-btn--${variant}`;
        btn.addEventListener('click', onClick);
        return btn;
    },

    createColorPicker({ label, value = '#ffffff', onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type  = 'color';
        input.value = value;
        input.addEventListener('input', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(input);
        return wrapper;
    },

    createSelect({ label, options = [], value, onChange }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'admin-field';

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const select = document.createElement('select');
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value       = opt.value;
            el.textContent = opt.label;
            if (opt.value === value) el.selected = true;
            select.appendChild(el);
        });
        select.addEventListener('change', e => onChange?.(e.target.value));

        wrapper.appendChild(lbl);
        wrapper.appendChild(select);
        return wrapper;
    }
};
