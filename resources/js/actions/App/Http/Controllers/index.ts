import Settings from './Settings'
import Editor from './Editor'

const Controllers = {
    Settings: Object.assign(Settings, Settings),
    Editor: Object.assign(Editor, Editor),
}

export default Controllers