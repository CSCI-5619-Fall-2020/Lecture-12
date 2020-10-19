/* CSCI 5619 Lecture 12, Fall 2020
 * Author: Evan Suma Rosenberg
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 */ 

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Space } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllercomponent";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { WebXRCamera } from "@babylonjs/core/XR/webXRCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Logger } from "@babylonjs/core/Misc/logger";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {MeshBuilder} from  "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Ray } from "@babylonjs/core/Culling/ray";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";

// Import debug layer
import "@babylonjs/inspector";

// Note: The structure has changed since previous assignments because we need to handle the 
// async methods used for setting up XR. In particular, "createDefaultXRExperienceAsync" 
// needs to load models and create various things.  So, the function returns a promise, 
// which allows you to do other things while it runs.  Because we don't want to continue
// executing until it finishes, we use "await" to wait for the promise to finish. However,
// await can only run inside async functions. https://javascript.info/async-await
class Game 
{ 
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    private scene: Scene;

    private xrCamera: WebXRCamera | null; 
    private leftController: WebXRInputSource | null;
    private rightController: WebXRInputSource | null;

    private cubeMaterial : StandardMaterial | null;
    
    private selectedObject: AbstractMesh | null;
    private selectionTransform: TransformNode | null;

    private laserPointer: LinesMesh | null;
    private bimanualVector: Vector3;
    
    constructor()
    {
        // Get the canvas element 
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

        // Generate the BABYLON 3D engine
        this.engine = new Engine(this.canvas, true); 

        // Creates a basic Babylon Scene object
        this.scene = new Scene(this.engine);   

        this.xrCamera = null;
        this.leftController = null;
        this.rightController = null;

        this.cubeMaterial = null;
        
        this.selectedObject = null;
        this.selectionTransform = null;
        
        this.laserPointer = null; 
        this.bimanualVector = Vector3.Zero();
    }

    start() : void 
    {
        // Create the scene and then execute this function afterwards
        this.createScene().then(() => {

            // Register a render loop to repeatedly render the scene
            this.engine.runRenderLoop(() => { 
                this.update();
                this.scene.render();
            });

            // Watch for browser/canvas resize events
            window.addEventListener("resize", () => { 
                this.engine.resize();
            });
        });
    }

    private async createScene() 
    {
        // This creates and positions a first-person camera (non-mesh)
        var camera = new UniversalCamera("camera1", new Vector3(0, 1.6, 0), this.scene);
        camera.fov = 90 * Math.PI / 180;
        camera.minZ = .1;
        camera.maxZ = 100;

        // This attaches the camera to the canvas
        camera.attachControl(this.canvas, true);

       // Create a point light
       var pointLight = new PointLight("pointLight", new Vector3(0, 2.5, 0), this.scene);
       pointLight.intensity = 1.0;
       pointLight.diffuse = new Color3(.25, .25, .25);

        // Creates a default skybox
        const environment = this.scene.createDefaultEnvironment({
            createGround: true,
            groundSize: 50,
            skyboxSize: 50,
            skyboxColor: new Color3(0, 0, 0)
        });
        environment!.ground!.isPickable = false;
        environment!.skybox!.isPickable = false;

        // Creates the XR experience helper
        const xrHelper = await this.scene.createDefaultXRExperienceAsync({});

        // Assigns the web XR camera to a member variable
        this.xrCamera = xrHelper.baseExperience.camera;

        xrHelper.teleportation.dispose();
        xrHelper.pointerSelection.dispose();

        /*
        // Register event handler for selection events (pulling the trigger, clicking the mouse button)
        this.scene.onPointerObservable.add((pointerInfo) => {
            this.processPointer(pointerInfo);
        });
        */

        var laserPoints = [];
        laserPoints.push(new Vector3(0, 0, 0));
        laserPoints.push(new Vector3(0, 0, 10));

        this.laserPointer = MeshBuilder.CreateLines("laserPointer", {points: laserPoints}, this.scene);
        this.laserPointer.color = Color3.Blue();
        this.laserPointer.alpha = .5;
        this.laserPointer.visibility = 0;
        this.laserPointer.isPickable = false;
        
        this.selectionTransform = new TransformNode("selectionTransform", this.scene);
        this.selectionTransform.parent = this.laserPointer;
        
        xrHelper.input.onControllerAddedObservable.add((inputSource) => {

            if(inputSource.uniqueId.endsWith("right")) 
            {
                this.rightController = inputSource;
                this.laserPointer!.parent = this.rightController.pointer;
                this.laserPointer!.visibility = 1;
            }
            else 
            {
                this.leftController = inputSource;
            }  
        });

        xrHelper.input.onControllerRemovedObservable.add((inputSource) => {

            if(inputSource.uniqueId.endsWith("right")) 
            {
                this.laserPointer!.parent = null;
                this.laserPointer!.visibility = 0;
            }
        });

        // Create a unselected blue emissive material
        this.cubeMaterial = new StandardMaterial("blueMaterial", this.scene);
        this.cubeMaterial.diffuseColor = new Color3(.284, .73, .831);
        this.cubeMaterial.specularColor = Color3.Black();
        this.cubeMaterial.emissiveColor = new Color3(.284, .73, .831);

        var testCube = MeshBuilder.CreateBox("testCube", {size: .25}, this.scene);
        testCube.position = new Vector3(.5, 1.5, 2);
        testCube.material = this.cubeMaterial;
        testCube.edgesWidth = .3;

        for(var i=0; i < 100; i++)
        {
            let cube = MeshBuilder.CreateBox("cube", {size: Math.random() * .4}, this.scene);
            cube.position = new Vector3(Math.random() * 15 - 7.5, Math.random() * 5 + .2, Math.random() * 15 - 7.5);
            cube.material = this.cubeMaterial;
            cube.edgesWidth = .3;
        }
        
        this.scene.debugLayer.show(); 
    }

    /*
    // Event handler for processing pointer selection events
    private processPointer(pointerInfo: PointerInfo)
    {
        switch (pointerInfo.type) {

            case PointerEventTypes.POINTERDOWN:   
                // deselect the currently selected object 
                if(this.selectedObject)
                {
                    this.selectedObject.disableEdgesRendering();
                    this.selectedObject = null;
                }

                // if an object was hit
                if(pointerInfo.pickInfo?.hit) 
                {
                    this.selectedObject = pointerInfo.pickInfo!.pickedMesh;
                    this.selectedObject!.enableEdgesRendering();
                }     
                break;
        }
    }
    */

    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        // Polling for controller input
        this.processControllerInput();  

        // Update the bimanual vector
        if(this.rightController && this.leftController)
        {
            this.bimanualVector = this.rightController.grip!.position.subtract(this.leftController.grip!.position);
        } 
    }

    // Process event handlers for controller input
    private processControllerInput()
    {
        this.onRightTrigger(this.rightController?.motionController?.getComponent("xr-standard-trigger"));
        this.onRightSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onLeftSqueeze(this.leftController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onRightThumbstick(this.rightController?.motionController?.getComponent("xr-standard-thumbstick"));
    }

    private onRightTrigger(component?: WebXRControllerComponent)
    {  
        if(component?.changes.pressed)
        {
            if(component?.pressed)
            {
                this.laserPointer!.color = Color3.Green();
                
                var ray = new Ray(this.rightController!.pointer.position, this.rightController!.pointer.forward, 10);
                var pickInfo = this.scene.pickWithRay(ray);

         
                // deselect the currently selected object 
                if(this.selectedObject)
                {
                    this.selectedObject.disableEdgesRendering();
                    this.selectedObject.setParent(null);
                    this.selectedObject = null;
                }

                // select the new object 
                if(pickInfo?.hit)
                {
                    this.selectionTransform!.position = new Vector3(0, 0, pickInfo.distance);
                    this.selectedObject = pickInfo.pickedMesh;
                    this.selectedObject!.enableEdgesRendering();
                    this.selectedObject!.setParent(this.selectionTransform!);
                }
            }
            else
            {
                if(this.selectedObject)
                {
                    this.selectedObject.setParent(null);
                }

                this.laserPointer!.color = Color3.Blue();
            }
        }  
    }

    private onRightSqueeze(component?: WebXRControllerComponent)
    {  
        if(component?.pressed && this.leftController && this.selectedObject)
        {
            var currentBimanualVector = this.rightController!.grip!.position.subtract(this.leftController!.grip!.position);

            var sourceVector = this.bimanualVector.normalizeToNew();
            var targetVector = currentBimanualVector.normalizeToNew();
            var angle = Math.acos(Vector3.Dot(sourceVector, targetVector));
            var axis = Vector3.Cross(sourceVector, targetVector);

            this.selectedObject.rotate(axis, angle, Space.WORLD);
        }
    }

    private onLeftSqueeze(component?: WebXRControllerComponent)
    {  
        if(component?.pressed && this.rightController && this.selectedObject)
        {
            var currentBimanualVector = this.rightController!.grip!.position.subtract(this.leftController!.grip!.position);
6
            var scaleFactor = currentBimanualVector.length() / this.bimanualVector.length();
            this.selectedObject.scaling = this.selectedObject.scaling.multiplyByFloats(scaleFactor, scaleFactor, scaleFactor);
        }
    }

    private onRightThumbstick(component?: WebXRControllerComponent)
    {  
        if(component?.changes.axes && this.selectedObject && this.selectedObject.parent)
        {
            var moveDistance = -component.axes.y * (this.engine.getDeltaTime() / 1000) * 3;
            this.selectedObject.translate(this.laserPointer!.forward, moveDistance, Space.WORLD);
        }
    }   
    
}
/******* End of the Game class ******/   

// start the game
var game = new Game();
game.start();