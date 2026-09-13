import ProjectController from './ProjectController'
import BrandKitController from './BrandKitController'
import AssetController from './AssetController'
import AssetStreamController from './AssetStreamController'
import GenerationController from './GenerationController'
import RenderController from './RenderController'
import BrandKitIntakeController from './BrandKitIntakeController'
import HeadlessRenderController from './HeadlessRenderController'

const Editor = {
    ProjectController: Object.assign(ProjectController, ProjectController),
    BrandKitController: Object.assign(BrandKitController, BrandKitController),
    AssetController: Object.assign(AssetController, AssetController),
    AssetStreamController: Object.assign(AssetStreamController, AssetStreamController),
    GenerationController: Object.assign(GenerationController, GenerationController),
    RenderController: Object.assign(RenderController, RenderController),
    BrandKitIntakeController: Object.assign(BrandKitIntakeController, BrandKitIntakeController),
    HeadlessRenderController: Object.assign(HeadlessRenderController, HeadlessRenderController),
}

export default Editor