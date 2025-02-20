OV.ImportSettings = class
{
    constructor ()
    {
        this.defaultColor = new OV.Color (200, 200, 200);
    }
};

OV.ImportErrorCode =
{
    NoImportableFile : 1,
    FailedToLoadFile : 2,
    ImportFailed : 3,
    UnknownError : 4
};

OV.ImportError = class
{
    constructor (code, message)
    {
        this.code = code;
        this.message = message;
    }
};

OV.ImportResult = class
{
    constructor ()
    {
        this.model = null;
        this.mainFile = null;
        this.upVector = null;
        this.usedFiles = null;
        this.missingFiles = null;
    }
};

OV.ImporterFileAccessor = class
{
    constructor (getBufferCallback)
    {
        this.getBufferCallback = getBufferCallback;
        this.fileBuffers = new Map ();
        this.textureBuffers = new Map ();
    }

    GetFileBuffer (filePath)
    {
        let fileName = OV.GetFileName (filePath);
        if (this.fileBuffers.has (fileName)) {
            return this.fileBuffers.get (fileName);
        }
        let buffer = this.getBufferCallback (fileName);
        this.fileBuffers.set (fileName, buffer);
        return buffer;
    }

    GetTextureBuffer (filePath)
    {
        let fileName = OV.GetFileName (filePath);
        if (this.textureBuffers.has (fileName)) {
            return this.textureBuffers.get (fileName);
        }
        let buffer = null;
        let textureBuffer = this.getBufferCallback (fileName);
        if (textureBuffer !== null) {
            buffer = {
                url : OV.CreateObjectUrl (textureBuffer),
                buffer : textureBuffer
            };
        }
        this.textureBuffers.set (fileName, buffer);
        return buffer;
    }
};

OV.Importer = class
{
    constructor ()
    {
        this.importers = [
            new OV.ImporterObj (),
            new OV.ImporterStl (),
            new OV.ImporterOff (),
            new OV.ImporterPly (),
            new OV.Importer3ds (),
            new OV.ImporterGltf (),
            new OV.ImporterO3dv (),
            new OV.Importer3dm (),
            new OV.ImporterIfc (),
            new OV.ImporterThreeFbx (),
            new OV.ImporterThreeDae (),
            new OV.ImporterThreeWrl (),
            new OV.ImporterThree3mf ()
        ];
        this.fileList = new OV.FileList ();
        this.model = null;
        this.usedFiles = [];
        this.missingFiles = [];
    }

	AddImporter (importer)
	{
		this.importers.push (importer);
	}

    ImportFiles (fileList, fileSource, settings, callbacks)
    {
        this.LoadFiles (fileList, fileSource, () => {
            callbacks.onFilesLoaded ();
            OV.RunTaskAsync (() => {
                this.ImportLoadedFiles (settings, callbacks);
            });
        });
    }

    LoadFiles (fileList, fileSource, onReady)
    {
        let newFileList = new OV.FileList (this.importers);
        if (fileSource === OV.FileSource.Url) {
            newFileList.FillFromFileUrls (fileList);
        } else if (fileSource === OV.FileSource.File) {
            newFileList.FillFromFileObjects (fileList);
        }
        let reset = false;
        if (this.HasImportableFile (newFileList)) {
            reset = true;
        } else {
            let foundMissingFile = false;
            for (let i = 0; i < this.missingFiles.length; i++) {
                let missingFile = this.missingFiles[i];
                if (newFileList.ContainsFileByPath (missingFile)) {
                    foundMissingFile = true;
                }
            }
            if (!foundMissingFile) {
                reset = true;
            } else {
                let newFiles = newFileList.GetFiles ();
                this.fileList.ExtendFromFileList (newFiles);
                reset = false;
            }
        }
        if (reset) {
            this.fileList = newFileList;
        }
        this.fileList.GetContent (() => {
            this.DecompressArchives (this.fileList, () => {
                onReady ();
            });
        });
    }

    ImportLoadedFiles (settings, callbacks)
    {
        let importableFiles = this.GetImportableFiles (this.fileList);
        if (importableFiles.length === 0) {
            callbacks.onImportError (new OV.ImportError (OV.ImportErrorCode.NoImportableFile, null));
            return;
        }

        if (importableFiles.length === 1 || !callbacks.onSelectMainFile) {
            let mainFile = importableFiles[0];
            this.ImportLoadedMainFile (mainFile, settings, callbacks);
        } else {
            let fileNames = importableFiles.map (importableFile => importableFile.file.name);
            callbacks.onSelectMainFile (fileNames, (mainFileIndex) => {
                if (mainFileIndex === null) {
                    callbacks.onImportError (new OV.ImportError (OV.ImportErrorCode.NoImportableFile, null));
                    return;
                }
                OV.RunTaskAsync (() => {
                    let mainFile = importableFiles[mainFileIndex];
                    this.ImportLoadedMainFile (mainFile, settings, callbacks);
                });
            });
        }
    }

    ImportLoadedMainFile (mainFile, settings, callbacks)
    {
        if (mainFile === null || mainFile.file === null || mainFile.file.content === null) {
            callbacks.onImportError (new OV.ImportError (OV.ImportErrorCode.FailedToLoadFile, null));
            return;
        }

        this.RevokeModelUrls ();
        this.model = null;
        this.usedFiles = [];
        this.missingFiles = [];
        this.usedFiles.push (mainFile.file.name);

        let importer = mainFile.importer;
        let fileAccessor = new OV.ImporterFileAccessor ((fileName) => {
            let fileBuffer = null;
            let file = this.fileList.FindFileByPath (fileName);
            if (file === null || file.content === null) {
                this.missingFiles.push (fileName);
                fileBuffer = null;
            } else {
                this.usedFiles.push (fileName);
                fileBuffer = file.content;
            }
            return fileBuffer;
        });

        importer.Import (mainFile.file.name, mainFile.file.extension, mainFile.file.content, {
            getDefaultMaterial : () => {
                let material = new OV.PhongMaterial ();
                material.color = settings.defaultColor;
                return material;
            },
            getFileBuffer : (filePath) => {
                return fileAccessor.GetFileBuffer (filePath);
            },
            getTextureBuffer : (filePath) => {
                return fileAccessor.GetTextureBuffer (filePath);
            },
            onSuccess : () => {
                this.model = importer.GetModel ();
                let result = new OV.ImportResult ();
                result.mainFile = mainFile.file.name;
                result.model = this.model;
                result.usedFiles = this.usedFiles;
                result.missingFiles = this.missingFiles;
                result.upVector = importer.GetUpDirection ();
                callbacks.onImportSuccess (result);
            },
            onError : () => {
                let message = importer.GetErrorMessage ();
                callbacks.onImportError (new OV.ImportError (OV.ImportErrorCode.ImportFailed, message));
            },
            onComplete : () => {
                importer.Clear ();
            }
        });
    }

    DecompressArchives (fileList, onReady)
    {
        let files = fileList.GetFiles ();
        let archives = [];
        for (let file of files) {
            if (file.extension === 'zip') {
                archives.push (file);
            }
        }
        if (archives.length === 0) {
            onReady ();
            return;
        }
        OV.LoadExternalLibrary ('loaders/fflate.min.js').then (() => {
            for (let i = 0; i < archives.length; i++) {
                const archiveFile = archives[i];
                const archiveBuffer = new Uint8Array (archiveFile.content);
                const decompressed = fflate.unzipSync (archiveBuffer);
                for (const fileName in decompressed) {
                    if (Object.prototype.hasOwnProperty.call (decompressed, fileName)) {
                        let file = new OV.File (fileName, OV.FileSource.Decompressed);
                        file.SetContent (decompressed[fileName].buffer);
                        fileList.AddFile (file);
                    }
                }
            }
            onReady ();
        }).catch (() => {
            onReady ();
        });
    }

    GetFileList ()
    {
        return this.fileList;
    }

    HasImportableFile (fileList)
    {
        let importableFiles = this.GetImportableFiles (fileList);
        return importableFiles.length > 0;
    }

    GetImportableFiles (fileList)
    {
        function FindImporter (file, importers)
        {
            for (let importerIndex = 0; importerIndex < importers.length; importerIndex++) {
                let importer = importers[importerIndex];
                if (importer.CanImportExtension (file.extension)) {
                    return importer;
                }
            }
            return null;
        }

        let importableFiles = [];
        let files = fileList.GetFiles ();
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            let file = files[fileIndex];
            let importer = FindImporter (file, this.importers);
            if (importer !== null) {
                importableFiles.push ({
                    file : file,
                    importer : importer
                });
            }
        }
        return importableFiles;
    }

    RevokeModelUrls ()
    {
        if (this.model === null) {
            return;
        }
        for (let i = 0; i < this.model.MaterialCount (); i++) {
            let material = this.model.GetMaterial (i);
            material.EnumerateTextureMaps ((texture) => {
                if (texture.url !== null) {
                    OV.RevokeObjectUrl (texture.url);
                }
            });
        }
    }
};
