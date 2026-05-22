import Agent from './Agent'
import Settings from './Settings'
import Editor from './Editor'

const Controllers = {
    Agent: Object.assign(Agent, Agent),
    Settings: Object.assign(Settings, Settings),
    Editor: Object.assign(Editor, Editor),
}

export default Controllers