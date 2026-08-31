import { mount } from 'svelte';
import DemoEditor from '@/components/editor/DemoEditor.svelte';

const element = document.getElementById('demo-editor');

if (element) {
    mount(DemoEditor, {
        target: element,
        props: {
            canRegister: element.dataset.canRegister === 'true',
        },
    });
}
