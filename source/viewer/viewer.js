OV.GetDefaultCamera = function (direction)
{
    if (direction === OV.Direction.X) {
        return new OV.Camera (
            new OV.Coord3D (2.0, -3.0, 1.5),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (1.0, 0.0, 0.0)
        );
    } else if (direction === OV.Direction.Y) {
        return new OV.Camera (
            new OV.Coord3D (-1.5, 2.0, 3.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 1.0, 0.0)
        );
    } else if (direction === OV.Direction.Z) {
        return new OV.Camera (
            new OV.Coord3D (-1.5, -3.0, 2.0),
            new OV.Coord3D (0.0, 0.0, 0.0),
            new OV.Coord3D (0.0, 0.0, 1.0)
        );
    }
    return null;
};

OV.TraverseThreeObject = function (object, processor)
{
    if (!processor (object)) {
        return false;
    }
    for (let child of object.children) {
        if (!OV.TraverseThreeObject (child, processor)) {
            return false;
        }
    }
    return true;
};

OV.SetThreeMeshPolygonOffset = function (mesh, offset)
{
    function SetMaterialsPolygonOffset (materials, offset)
    {
        for (let material of materials) {
            material.polygonOffset = offset;
            material.polygonOffsetUnit = 1;
            material.polygonOffsetFactor = 1;
        }
    }

    SetMaterialsPolygonOffset (mesh.material, offset);
    if (mesh.userData.threeMaterials) {
        SetMaterialsPolygonOffset (mesh.userData.threeMaterials, offset);
    }
};

OV.GetShadingTypeOfObject = function (mainObject)
{
    let shadingType = null;
    OV.TraverseThreeObject (mainObject, (obj) => {
        if (obj.isMesh) {
            for (const material of obj.material) {
                if (material.type === 'MeshPhongMaterial') {
                    shadingType = OV.ShadingType.Phong;
                } else if (material.type === 'MeshStandardMaterial') {
                    shadingType = OV.ShadingType.Physical;
                }
                return false;
            }
        }
        return true;
    });
    return shadingType;
};

OV.UpVector = class
{
    constructor ()
    {
        this.direction = OV.Direction.Z;
        this.isFixed = true;
        this.isFlipped = false;
    }

    SetDirection (newDirection, oldCamera)
    {
        this.direction = newDirection;
        this.isFlipped = false;

        let defaultCamera = OV.GetDefaultCamera (this.direction);
        let defaultDir = OV.SubCoord3D (defaultCamera.eye, defaultCamera.center);

        let distance = OV.CoordDistance3D (oldCamera.center, oldCamera.eye);
        let newEye = oldCamera.center.Clone ().Offset (defaultDir, distance);

        let newCamera = oldCamera.Clone ();
        if (this.direction === OV.Direction.X) {
            newCamera.up = new OV.Coord3D (1.0, 0.0, 0.0);
            newCamera.eye = newEye;
        } if (this.direction === OV.Direction.Y) {
            newCamera.up = new OV.Coord3D (0.0, 1.0, 0.0);
            newCamera.eye = newEye;
        } else if (this.direction === OV.Direction.Z) {
            newCamera.up = new OV.Coord3D (0.0, 0.0, 1.0);
            newCamera.eye = newEye;
        }
        return newCamera;
    }

    SetFixed (isFixed, oldCamera)
    {
        this.isFixed = isFixed;
        if (this.isFixed) {
            return this.SetDirection (this.direction, oldCamera);
        }
        return null;
    }

    Flip (oldCamera)
    {
        this.isFlipped = !this.isFlipped;
        let newCamera = oldCamera.Clone ();
        newCamera.up.MultiplyScalar (-1.0);
        return newCamera;
    }
};

OV.ViewerGeometry = class
{
    constructor (scene)
    {
        this.scene = scene;
        this.mainObject = null;
        this.mainEdgeObject = null;
        this.edgeSettings = {
            showEdges : false,
            edgeColor : new OV.Color (0, 0, 0),
            edgeThreshold : 1
        };
    }

    SetMainObject (mainObject)
    {
        this.mainObject = mainObject;
        this.scene.add (this.mainObject);
        if (this.edgeSettings.showEdges) {
            this.GenerateMainEdgeObject ();
        }
    }

    SetEdgeSettings (show, color, threshold)
    {
        let needToGenerate = false;
        if (show && (!this.edgeSettings.showEdges || this.edgeSettings.edgeThreshold !== threshold)) {
            needToGenerate = true;
        }

        this.edgeSettings.showEdges = show;
        this.edgeSettings.edgeThreshold = threshold;
        this.edgeSettings.edgeColor = color;

        if (this.mainObject === null) {
            return;
        }

        if (this.edgeSettings.showEdges) {
            if (needToGenerate) {
                this.ClearMainEdgeObject ();
                this.GenerateMainEdgeObject ();
            } else {
                let edgeColor = new THREE.Color (
                    this.edgeSettings.edgeColor.r / 255.0,
                    this.edgeSettings.edgeColor.g / 255.0,
                    this.edgeSettings.edgeColor.b / 255.0
                );
                this.EnumerateEdges ((edge) => {
                    edge.material.color = edgeColor;
                });
            }
        } else {
            this.ClearMainEdgeObject ();
        }
    }

    GenerateMainEdgeObject ()
    {
        let edgeColor = new THREE.Color (
            this.edgeSettings.edgeColor.r / 255.0,
            this.edgeSettings.edgeColor.g / 255.0,
            this.edgeSettings.edgeColor.b / 255.0
        );
        this.mainEdgeObject = new THREE.Object3D ();
        this.mainObject.updateWorldMatrix (true, true);
        this.EnumerateMeshes ((mesh) => {
            OV.SetThreeMeshPolygonOffset (mesh, true);
            let edges = new THREE.EdgesGeometry (mesh.geometry, this.edgeSettings.edgeThreshold);
            let line = new THREE.LineSegments (edges, new THREE.LineBasicMaterial ({
                color: edgeColor
            }));
            line.applyMatrix4 (mesh.matrixWorld);
            line.userData = mesh.userData;
            line.visible = mesh.visible;
            this.mainEdgeObject.add (line);
        });
        this.scene.add (this.mainEdgeObject);
    }

    Clear ()
    {
        this.ClearMainObject ();
        this.ClearMainEdgeObject ();
    }

    ClearMainObject ()
    {
        if (this.mainObject === null) {
            return;
        }

        this.EnumerateMeshes ((mesh) => {
            mesh.geometry.dispose ();
        });
        this.scene.remove (this.mainObject);
        this.mainObject = null;
    }

    ClearMainEdgeObject ()
    {
        if (this.mainEdgeObject === null) {
            return;
        }

        this.EnumerateMeshes ((mesh) => {
            OV.SetThreeMeshPolygonOffset (mesh, false);
        });
        this.EnumerateEdges ((edge) => {
            edge.geometry.dispose ();
        });
        this.scene.remove (this.mainEdgeObject);
        this.mainEdgeObject = null;
    }

    EnumerateMeshes (enumerator)
    {
        if (this.mainObject === null) {
            return;
        }
        this.mainObject.traverse ((obj) => {
            if (obj.isMesh) {
                enumerator (obj);
            }
        });
    }

    EnumerateEdges (enumerator)
    {
        if (this.mainEdgeObject === null) {
            return;
        }
        this.mainEdgeObject.traverse ((obj) => {
            if (obj.isLineSegments) {
                enumerator (obj);
            }
        });
    }

    GetMeshIntersectionUnderMouse (mouseCoords, camera, width, height)
    {
        if (this.mainObject === null) {
            return null;
        }

        let raycaster = new THREE.Raycaster ();
        let mousePos = new THREE.Vector2 ();
        mousePos.x = (mouseCoords.x / width) * 2 - 1;
        mousePos.y = -(mouseCoords.y / height) * 2 + 1;
        raycaster.setFromCamera (mousePos, camera);
        let iSectObjects = raycaster.intersectObject (this.mainObject, true);
        for (let i = 0; i < iSectObjects.length; i++) {
            let iSectObject = iSectObjects[i];
            if (iSectObject.object.type === 'Mesh' && iSectObject.object.visible) {
                return iSectObject;
            }
        }

        return null;
    }
};

OV.ViewerExtraGeometry = class
{
    constructor (scene)
    {
        this.scene = scene;
        this.mainObject = null;
    }

    AddObject (object)
    {
        if (this.mainObject === null) {
            this.mainObject = new THREE.Object3D ();
            this.scene.add (this.mainObject);
        }
        this.mainObject.add (object);
    }

    Clear ()
    {
        if (this.mainObject === null) {
            return;
        }
        this.mainObject.traverse ((obj) => {
            if (obj.isMesh || obj.isLineSegments) {
                obj.geometry.dispose ();
            }
        });
        this.scene.remove (this.mainObject);
        this.mainObject = null;
    }
};

OV.ViewerAxis = class
{
    constructor (scene)
    {
        this.scene = scene;
        this.mainObject = null;
    }

    AddAxisLines (boundingBox, cellSize)
    {
        function CreateLine (from, to, material)
        {
            let points = [from, to];
            let geometry = new THREE.BufferGeometry ().setFromPoints (points);
            let line = new THREE.Line (geometry, material);
            return line;
        }

        this.RemoveAxisLines ();

        this.mainObject = new THREE.Object3D ();
        const material = new THREE.LineBasicMaterial({
            color: 0xcccccc
        });

        let boundingBoxSize = new THREE.Vector3 ();
        boundingBox.getSize (boundingBoxSize);
        let expandSize = boundingBoxSize.y * 0.5;

        let minValue = new THREE.Vector2 (boundingBox.min.z - expandSize, boundingBox.min.x - expandSize);
        let maxValue = new THREE.Vector2 (boundingBox.max.z + expandSize, boundingBox.max.x + expandSize);

        let alignedMinValue = new THREE.Vector2 (
            Math.floor (minValue.x / cellSize) * cellSize,
            Math.floor (minValue.y / cellSize) * cellSize
        );
        let alignedMaxValue = new THREE.Vector2 (
            Math.ceil (maxValue.x / cellSize) * cellSize,
            Math.ceil (maxValue.y / cellSize) * cellSize
        );

        let level = boundingBox.min.y;
        let cellCountX = Math.ceil ((alignedMaxValue.x - alignedMinValue.x) / cellSize);
        let cellCountY = Math.ceil ((alignedMaxValue.y - alignedMinValue.y) / cellSize);
        for (let step = 0; step < cellCountX + 1; step++) {
            let lineDist = alignedMinValue.x + step * cellSize;
            this.mainObject.add (CreateLine (new THREE.Vector3 (alignedMinValue.y, level, lineDist), new THREE.Vector3 (alignedMaxValue.y, level, lineDist), material));
        }
        for (let step = 0; step < cellCountY + 1; step++) {
            let lineDist = alignedMinValue.y + step * cellSize;
            this.mainObject.add (CreateLine (new THREE.Vector3 (lineDist, level, alignedMinValue.x), new THREE.Vector3 (lineDist, level, alignedMaxValue.x), material));
        }
        this.scene.add (this.mainObject);
    }

    RemoveAxisLines ()
    {
        if (this.mainObject !== null) {
            this.scene.remove (this.mainObject);
            this.mainObject = null;
        }
    }
};

OV.ShadingModel = class
{
    constructor (scene)
    {
        this.scene = scene;

        this.type = OV.ShadingType.Phong;
        this.ambientLight = new THREE.AmbientLight (0x888888);
        this.directionalLight = new THREE.DirectionalLight (0x888888);
        this.environment = null;

        this.scene.add (this.ambientLight);
        this.scene.add (this.directionalLight);
    }

    SetType (type)
    {
        this.type = type;
        if (this.type === OV.ShadingType.Phong) {
            this.ambientLight.color.set (0x888888);
            this.directionalLight.color.set (0x888888);
            this.scene.environment = null;
        } else if (this.type === OV.ShadingType.Physical) {
            this.ambientLight.color.set (0x000000);
            this.directionalLight.color.set (0x555555);
            this.scene.environment = this.environment;
        }
    }

    SetEnvironment (textures, onLoaded)
    {
        let loader = new THREE.CubeTextureLoader ();
        this.environment = loader.load (textures, () => {
            onLoaded ();
        });
    }

    UpdateByCamera (camera)
    {
        const lightDir = OV.SubCoord3D (camera.eye, camera.center);
        this.directionalLight.position.set (lightDir.x, lightDir.y, lightDir.z);
    }

    CreateHighlightMaterial (highlightColor, withOffset)
    {
        let material = null;
        if (this.type === OV.ShadingType.Phong) {
            material = new THREE.MeshPhongMaterial ({
                color : highlightColor,
                side : THREE.DoubleSide
            });
        } else if (this.type === OV.ShadingType.Physical) {
            material = new THREE.MeshStandardMaterial ({
                color : highlightColor,
                side : THREE.DoubleSide
            });
        }
        if (material !== null && withOffset) {
            material.polygonOffset = true;
            material.polygonOffsetUnit = 1;
            material.polygonOffsetFactor = 1;
        }
        return material;
    }
};

OV.Viewer = class
{
    constructor ()
    {
        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.geometry = null;
        this.extraGeometry = null;
        this.axis = null;
        this.camera = null;
        this.shading = null;
        this.navigation = null;
        this.upVector = null;
        this.settings = {
            animationSteps : 40
        };
    }

    Init (canvas)
    {
        this.canvas = canvas;
        this.canvas.id = 'viewer';

        let parameters = {
            canvas : this.canvas,
            antialias : true
        };

        this.renderer = new THREE.WebGLRenderer (parameters);
        if (window.devicePixelRatio) {
            this.renderer.setPixelRatio (window.devicePixelRatio);
        }
        this.renderer.setClearColor ('#ffffff', 1.0);
        this.renderer.setSize (this.canvas.width, this.canvas.height);

        this.scene = new THREE.Scene ();
        this.geometry = new OV.ViewerGeometry (this.scene);
        this.extraGeometry = new OV.ViewerExtraGeometry (this.scene);
        this.axis = new OV.ViewerAxis (this.scene);

        this.InitCamera ();
        this.InitShading ();

        this.Render ();
    }

    SetMouseClickHandler (onMouseClick)
    {
        this.navigation.SetMouseClickHandler (onMouseClick);
    }

    SetMouseMoveHandler (onMouseMove)
    {
        this.navigation.SetMouseMoveHandler (onMouseMove);
    }

    SetContextMenuHandler (onContext)
    {
        this.navigation.SetContextMenuHandler (onContext);
    }

    SetBackgroundColor (color)
    {
        let hexColor = '#' + OV.ColorToHexString (color);
        this.renderer.setClearColor (hexColor, 1.0);
        this.Render ();
    }

    SetEdgeSettings (show, color, threshold)
    {
        this.geometry.SetEdgeSettings (show, color, threshold);
        this.Render ();
    }

    SetEnvironmentMap (textures)
    {
        this.shading.SetEnvironment (textures, () => {
            this.Render ();
        });
    }

    GetCanvas ()
    {
        return this.canvas;
    }

    GetCamera ()
    {
        return this.navigation.GetCamera ();
    }

    SetCamera (camera)
    {
        this.navigation.SetCamera (camera);
        this.Render ();
    }

    Resize (width, height)
    {
        let innerSize = OV.GetDomElementInnerDimensions (this.canvas, width, height);
        this.ResizeRenderer (innerSize.width, innerSize.height);
    }

    ResizeRenderer (width, height)
    {
        if (window.devicePixelRatio) {
            this.renderer.setPixelRatio (window.devicePixelRatio);
        }
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix ();
        this.renderer.setSize (width, height);
        this.Render ();
    }

    FitSphereToWindow (boundingSphere, animation)
    {
        if (boundingSphere === null) {
            return;
        }
        let center = new OV.Coord3D (boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
        let radius = boundingSphere.radius;
        let fov = this.camera.fov;
        if (animation) {
            let newCamera = this.navigation.GetFitToSphereCamera (center, radius, fov);
            this.navigation.MoveCamera (newCamera, this.settings.animationSteps);
        } else {
            this.navigation.FitToSphere (center, radius, fov);
        }
    }

    AdjustClippingPlanesToSphere (boundingSphere)
    {
        if (boundingSphere === null) {
            return;
        }
        if (boundingSphere.radius < 10.0) {
            this.camera.near = 0.01;
            this.camera.far = 100.0;
        } else if (boundingSphere.radius < 100.0) {
            this.camera.near = 0.1;
            this.camera.far = 1000.0;
        } else if (boundingSphere.radius < 1000.0) {
            this.camera.near = 10.0;
            this.camera.far = 10000.0;
        } else {
            this.camera.near = 100.0;
            this.camera.far = 1000000.0;
        }
        this.camera.updateProjectionMatrix ();
        this.Render ();
    }

    IsFixUpVector ()
    {
        return this.navigation.IsFixUpVector ();
    }

    SetFixUpVector (fixUpVector)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetFixed (fixUpVector, oldCamera);
        this.navigation.SetFixUpVector (fixUpVector);
        if (newCamera !== null) {
            this.navigation.MoveCamera (newCamera, this.settings.animationSteps);
        }
        this.Render ();
    }

    SetUpVector (upDirection, animate)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetDirection (upDirection, oldCamera);
        let animationSteps = animate ? this.settings.animationSteps : 0;
        this.navigation.MoveCamera (newCamera, animationSteps);
        this.Render ();
    }

    FlipUpVector ()
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.Flip (oldCamera);
        this.navigation.MoveCamera (newCamera, 0);
        this.Render ();
    }

    Render ()
    {
        let navigationCamera = this.navigation.GetCamera ();
        this.camera.position.set (navigationCamera.eye.x, navigationCamera.eye.y, navigationCamera.eye.z);
        this.camera.up.set (navigationCamera.up.x, navigationCamera.up.y, navigationCamera.up.z);
        this.camera.lookAt (new THREE.Vector3 (navigationCamera.center.x, navigationCamera.center.y, navigationCamera.center.z));

        this.shading.UpdateByCamera (navigationCamera);
        this.renderer.render (this.scene, this.camera);
    }

    SetMainObject (object)
    {
        const shadingType = OV.GetShadingTypeOfObject (object);
        this.geometry.SetMainObject (object);
        this.shading.SetType (shadingType);

        // let boundingBox = this.GetBoundingBox ((meshUserData) => {
        //     return true;
        // });
        // let cellSize = 1.0;
        // this.axis.AddAxisLines (boundingBox, cellSize);

        this.Render ();
    }

    AddExtraObject (object)
    {
        this.extraGeometry.AddObject (object);
        this.Render ();
    }

    Clear ()
    {
        this.geometry.Clear ();
        this.extraGeometry.Clear ();
        this.Render ();
    }

    ClearExtra ()
    {
        this.extraGeometry.Clear ();
        this.Render ();
    }

    SetMeshesVisibility (isVisible)
    {
        this.geometry.EnumerateMeshes ((mesh) => {
            let visible = isVisible (mesh.userData);
            if (mesh.visible !== visible) {
                mesh.visible = visible;
            }
        });
        this.geometry.EnumerateEdges ((edge) => {
            let visible = isVisible (edge.userData);
            if (edge.visible !== visible) {
                edge.visible = visible;
            }
        });
        this.Render ();
    }

    SetMeshesHighlight (highlightColor, isHighlighted)
    {
        function CreateHighlightMaterials (originalMaterials, highlightMaterial)
        {
            let highlightMaterials = [];
            for (let i = 0; i < originalMaterials.length; i++) {
                highlightMaterials.push (highlightMaterial);
            }
            return highlightMaterials;
        }

        const highlightMaterial = this.CreateHighlightMaterial (highlightColor);
        this.geometry.EnumerateMeshes ((mesh) => {
            let highlighted = isHighlighted (mesh.userData);
            if (highlighted) {
                if (mesh.userData.threeMaterials === null) {
                    mesh.userData.threeMaterials = mesh.material;
                    mesh.material = CreateHighlightMaterials (mesh.material, highlightMaterial);
                }
            } else {
                if (mesh.userData.threeMaterials !== null) {
                    mesh.material = mesh.userData.threeMaterials;
                    mesh.userData.threeMaterials = null;
                }
            }
        });

        this.Render ();
    }

    CreateHighlightMaterial (highlightColor)
    {
        const showEdges = this.geometry.edgeSettings.showEdges;
        return this.shading.CreateHighlightMaterial (highlightColor, showEdges);
    }

    GetMeshUserDataUnderMouse (mouseCoords)
    {
        let intersection = this.GetMeshIntersectionUnderMouse (mouseCoords);
        if (intersection === null) {
            return null;
        }
        return intersection.object.userData;
    }

    GetMeshIntersectionUnderMouse (mouseCoords)
    {
        let width = this.canvas.width;
        let height = this.canvas.height;
        if (window.devicePixelRatio) {
            width /= window.devicePixelRatio;
            height /= window.devicePixelRatio;
        }
        let intersection = this.geometry.GetMeshIntersectionUnderMouse (mouseCoords, this.camera, width, height);
        if (intersection === null) {
            return null;
        }
        return intersection;
    }

    GetBoundingBox (needToProcess)
    {
        let hasMesh = false;
        let boundingBox = new THREE.Box3 ();
        this.geometry.EnumerateMeshes ((mesh) => {
            if (needToProcess (mesh.userData)) {
                boundingBox.union (new THREE.Box3 ().setFromObject (mesh));
                hasMesh = true;
            }
        });

        if (!hasMesh) {
            return null;
        }
        return boundingBox;
    }

    GetBoundingSphere (needToProcess)
    {
        let boundingBox = this.GetBoundingBox (needToProcess);
        if (boundingBox === null) {
            return null;
        }

        let boundingSphere = new THREE.Sphere ();
        boundingBox.getBoundingSphere (boundingSphere);
        return boundingSphere;
    }

    EnumerateMeshesUserData (enumerator)
    {
        this.geometry.EnumerateMeshes ((mesh) => {
            enumerator (mesh.userData);
        });
    }

    InitCamera ()
    {
        this.camera = new THREE.PerspectiveCamera (45.0, this.canvas.width / this.canvas.height, 0.1, 1000.0);
        this.scene.add (this.camera);

        let canvasElem = this.renderer.domElement;
        let camera = OV.GetDefaultCamera (OV.Direction.Z);

        this.navigation = new OV.Navigation (canvasElem, camera);
        this.navigation.SetUpdateHandler (() => {
            this.Render ();
        });

        this.upVector = new OV.UpVector ();
    }

    InitShading  ()
    {
        this.shading = new OV.ShadingModel (this.scene);
    }

    GetImageSize ()
    {
        let originalSize = new THREE.Vector2 ();
        this.renderer.getSize (originalSize);
        return {
            width : parseInt (originalSize.x, 10),
            height : parseInt (originalSize.y, 10)
        };
    }

    GetImageAsDataUrl (width, height)
    {
        let originalSize = this.GetImageSize ();
        let renderWidth = width;
        let renderHeight = height;
        if (window.devicePixelRatio) {
            renderWidth /= window.devicePixelRatio;
            renderHeight /= window.devicePixelRatio;
        }
        this.ResizeRenderer (renderWidth, renderHeight);
        this.Render ();
        let url = this.renderer.domElement.toDataURL ();
        this.ResizeRenderer (originalSize.width, originalSize.height);
        return url;
    }
};
