import ProjectController from './ProjectController'
import AssetController from './AssetController'
import AssetStreamController from './AssetStreamController'
import GenerationController from './GenerationController'
import RenderController from './RenderController'
import HeadlessRenderController from './HeadlessRenderController'

const Editor = {
    ProjectController: Object.assign(ProjectController, ProjectController),
    AssetController: Object.assign(AssetController, AssetController),
    AssetStreamController: Object.assign(AssetStreamController, AssetStreamController),
    GenerationController: Object.assign(GenerationController, GenerationController),
    RenderController: Object.assign(RenderController, RenderController),
    HeadlessRenderController: Object.assign(HeadlessRenderController, HeadlessRenderController),
}

export default Editor