/* CSCI 5619 Lecture 12, Fall 2020
 * Author: Evan Suma Rosenberg
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 */ 

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllercomponent";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { WebXRCamera } from "@babylonjs/core/XR/webXRCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Logger } from "@babylonjs/core/Misc/logger";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {MeshBuilder} from  "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";

// Import debug layer
import "@babylonjs/inspector";
import { Material } from "@babylonjs/core/Materials/material";

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
    
    private selectedObject: AbstractMesh | null;
    private selectableObjects: Array<AbstractMesh>;
    private defaultMaterial : StandardMaterial | null;
    private selectedMaterial : StandardMaterial | null;

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
        
        this.selectedObject = null;
        this.selectableObjects = [];

        this.defaultMaterial = null;
        this.selectedMaterial = null;
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

        // Creates the XR experience helper
        const xrHelper = await this.scene.createDefaultXRExperienceAsync({});
        xrHelper.teleportation.dispose();
        //xrHelper.pointerSelection.dispose();

        // Register event handler for selection events (pulling the trigger, clicking the mouse button)
        this.scene.onPointerObservable.add((pointerInfo) => {
            this.processPointer(pointerInfo);
        });

        // Assigns the web XR camera to a member variable
        this.xrCamera = xrHelper.baseExperience.camera;

        // There is a bug in Babylon 4.1 that fails to reenable pointer selection after a teleport
        // This is a hacky workaround that disables a different unused feature instead
        xrHelper.teleportation.setSelectionFeature(xrHelper.baseExperience.featuresManager.getEnabledFeature("xr-background-remover"));

        xrHelper.input.onControllerAddedObservable.add((inputSource) => {

            if(inputSource.uniqueId.endsWith("left")) 
            {
                this.leftController = inputSource;
            }
            else 
            {
                this.rightController = inputSource;
            }  
        });

        // Create a unselected blue emissive material
        this.defaultMaterial = new StandardMaterial("blueMaterial", this.scene);
        this.defaultMaterial.diffuseColor = new Color3(.284, .73, .831);
        this.defaultMaterial.specularColor = Color3.Black();
        this.defaultMaterial.emissiveColor = new Color3(.284, .73, .831);

        // Create a unselected red emissive material
        this.selectedMaterial = new StandardMaterial("redMaterial", this.scene);
        this.selectedMaterial.diffuseColor = new Color3(1, 0, 0);
        this.selectedMaterial.specularColor = Color3.Black();
        this.selectedMaterial.emissiveColor = new Color3(1, 0, 0);

        for(var i=0; i < 100; i++)
        {
            let cube = MeshBuilder.CreateBox("exampleCube", {size: Math.random() * .4}, this.scene);
            cube.position = new Vector3(Math.random() * 15 - 7.5, Math.random() * 5 + .2, Math.random() * 15 - 7.5);
            cube.material = this.defaultMaterial;

            this.selectableObjects.push(cube);
        }
        
        this.scene.debugLayer.show(); 
    }

    // Event handler for processing pointer selection events
    private processPointer(pointerInfo: PointerInfo)
    {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                if (pointerInfo.pickInfo?.hit) 
                {
                    // if we selected a selectable object
                    if(this.selectableObjects.includes(pointerInfo.pickInfo.pickedMesh!))
                    {
                        // if an object was already selected, deselect it
                        if(this.selectedObject)
                        {
                            this.selectedObject.material = this.defaultMaterial;
                        }

                        // select the new object
                        this.selectedObject = pointerInfo.pickInfo.pickedMesh;
                        this.selectedObject!.material = this.selectedMaterial;
                    }
                    // otherwise, deselect any currently selected object
                    else if(this.selectedObject)
                    {
                        this.selectedObject.material = this.defaultMaterial;
                        this.selectedObject = null;
                    }
                }
                break;
        }
    }

    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        // Polling for controller input
        this.processControllerInput();  
    }

    // Process event handlers for controller input
    private processControllerInput()
    {
        this.onTrigger(this.leftController?.motionController?.getComponent("xr-standard-trigger"));
        this.onTrigger(this.rightController?.motionController?.getComponent("xr-standard-trigger"));
        this.onSqueeze(this.leftController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
    }

    private onTrigger(component?: WebXRControllerComponent)
    {  
        if(component?.changes.pressed)
        {
            if(component?.pressed)
            {
                Logger.Log("trigger pressed");
            }
            else
            {
                Logger.Log("trigger released");
            }
        }  
    }

    private onSqueeze(component?: WebXRControllerComponent)
    {  
        if(component?.changes.pressed)
        {
            if(component?.pressed)
            {
                Logger.Log("squeeze pressed");
            }
            else
            {
                Logger.Log("squeeze released");
            }
        }  
    }
    
}
/******* End of the Game class ******/   

// start the game
var game = new Game();
game.start();