import BlogController from './BlogController'
import ProgrammaticPageController from './ProgrammaticPageController'

const Seo = {
    BlogController: Object.assign(BlogController, BlogController),
    ProgrammaticPageController: Object.assign(ProgrammaticPageController, ProgrammaticPageController),
}

export default Seo