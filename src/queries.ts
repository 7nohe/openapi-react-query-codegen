import glob from 'glob';
import ejs from 'ejs';
import fs from 'fs';
import { join } from "path";

export async function makeQueries(
  outputPath: string,
  generatedClientsPath: string,
) {
  const services = glob.sync(`${generatedClientsPath}/services/*.ts`);
  return services
    .forEach((path) => {
      let template = ejs.render(`
        import { useQuery } from 'react-query';
        import { PetsService } from '../requests/services/PetsService'
        const usePets = useQuery(['listPets'], PetsService.listPets());
        export usePets;
      `);
      fs.writeFileSync(join(outputPath, 'service.ts'), template);
    });

}
