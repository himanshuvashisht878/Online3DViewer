var assert = require ('assert');

describe ('Generator', function () {
    it ('Cuboid with Default Parameters', function () {
        const cuboid = OV.GenerateCuboid (null, 1.0, 1.0, 1.0);
        assert (OV.IsSolid (cuboid));
        assert (OV.IsEqual (OV.CalculateVolume (cuboid), 1.0));
    });

    it ('Cuboid with Material', function () {
        const params = new OV.GeneratorParams ().SetMaterial (1);
        const cuboid = OV.GenerateCuboid (params, 1.0, 1.0, 1.0);
        for (let i = 0; i < cuboid.TriangleCount (); i++) {
            const triangle = cuboid.GetTriangle (i);
            assert.strictEqual (triangle.mat, 1);
        }
    });

    it ('Cylinder with Default Parameters', function () {
        const cylinder = OV.GenerateCylinder (null, 0.5, 1.0, 25, false);
        assert (OV.IsSolid (cylinder));
        assert (OV.IsEqualEps (OV.CalculateVolume (cylinder), Math.PI * 0.5 * 0.5 * 1.0, 0.1));
    });

    it ('Sphere with Default Parameters', function () {
        const cylinder = OV.GenerateSphere (null, 0.5, 20, false);
        assert (OV.IsSolid (cylinder));
        assert (OV.IsEqualEps (OV.CalculateVolume (cylinder), Math.PI * 0.5 * 0.5 * 0.5 * 4.0 / 3.0, 0.1));
    });

    it ('Platonic Solids', function () {
        let tetrahedron = OV.GeneratePlatonicSolid (null, 'tetrahedron', 1.0);
        assert (OV.IsSolid (tetrahedron));
        assert (OV.IsEqual (OV.CalculateVolume (tetrahedron), 0.5132002392796676));

        let hexahedron = OV.GeneratePlatonicSolid (null, 'hexahedron', 1.0);
        assert (OV.IsSolid (hexahedron));
        assert (OV.IsEqual (OV.CalculateVolume (hexahedron), 1.5396007178390028));

        let octahedron = OV.GeneratePlatonicSolid (null, 'octahedron', 1.0);
        assert (OV.IsSolid (octahedron));
        assert (OV.IsEqual (OV.CalculateVolume (octahedron), 1.3333333333333333));

        let dodecahedron = OV.GeneratePlatonicSolid (null, 'dodecahedron', 1.0);
        assert (OV.IsSolid (dodecahedron));
        assert (OV.IsEqual (OV.CalculateVolume (dodecahedron), 2.7851638631226248));

        let icosahedron = OV.GeneratePlatonicSolid (null, 'icosahedron', 1.0);
        assert (OV.IsSolid (icosahedron));
        assert (OV.IsEqual (OV.CalculateVolume (icosahedron), 2.5361507101204093));
    });
});
