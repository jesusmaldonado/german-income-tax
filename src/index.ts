/**
 *  German Income Tax
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 *
 *  Calculates the tax for germany, including income tax and solidarity tax
 *
 */

/** Local Dependencies */
import parameters, { Year, Zone } from "./parameters";
const jsonexport = require( "jsonexport" );
var fs = require('fs');
/** Exports */
export { Year } from "./parameters";

/**
 * Will return which zone is the income of the person
 *
 * @param income  The income of the person
 * @param year    The year that this income was earned
 */
function getZone( income : number, year : Year ) {

    const zones = parameters[year].zoneBoundaries;

    if ( income <= zones[1] ) {
        return Zone.First;
    } else if ( income <= zones[2] ) {
        return Zone.Second;
    } else if ( income <= zones[3] ) {
        return Zone.Third;
    } else if ( income <= zones[4] ) {
        return Zone.Fourth;
    } else {
        return Zone.Fifth;
    }

}

/**
 * Calculate the solidarity tax
 *
 * The solidarity tax is not applied for income tax below certain threshold.
 *
 * https://de.wikipedia.org/wiki/Solidaritätszuschlag
 * https://www.ihk-muenchen.de/ihk/documents/Recht-Steuern/Steuerrecht/Einkommensteuer/Gesetz-zur-Umsetzung-der-Änderungen-der-EU-Amtshilferichtlinie.pdf
 *
 * @param tax     The income tax paid
 * @param year    The year that the tax was for
 * @param couple  Calculate as if the income of a married couple
 */
function solidarity( tax : number, year : Year, couple : boolean ) {
    const { solidarity, solidarityThreshold } = parameters[year];
    if ( tax <= solidarityThreshold * (couple ? 2 : 1) ) { return 0; }
    return Math.min(
        solidarity * tax,
        (tax - (solidarityThreshold * (couple ? 2 : 1))) * 0.2
    );
}

/**
 * Get the income tax for a year
 *
 * The formula is taken from
 *
 * https://de.wikipedia.org/wiki/Einkommensteuer_(Deutschland)#Tarif_2018
 *
 * @param income  The income of the individual(s)
 * @param year    The year that this income was earned
 * @param zone    The zone which this income is in
 */
function tax( income : number, year : Year, zone : Zone ) : number {

    const { zoneBoundaries, progression, threshold, percent } = parameters[year];

    switch ( zone ) {
        case Zone.First:
            return 0;
        case Zone.Second:
            const y = (income - zoneBoundaries[1]) / 10000;
            return ((progression[Zone.Second] * y) + threshold[Zone.Second] * 10000) * y;
        case Zone.Third:
            const z = (income - zoneBoundaries[2]) / 10000;
            return (((progression[Zone.Third] * z) + threshold[Zone.Third] * 10000) * z) +
                tax( zoneBoundaries[2], year, Zone.Second );
        case Zone.Fourth:
            return (percent[Zone.Fourth] * (income - zoneBoundaries[3])) +
                tax( zoneBoundaries[3], year, Zone.Third );
        case Zone.Fifth:
            return (percent[Zone.Fifth] * (income - zoneBoundaries[4])) +
                tax( zoneBoundaries[4], year, Zone.Fourth );
    }

}

/**
 * Options provided to the tax function
 */
export interface TaxOptions {
    couple? : boolean,
    publicHealthInsurance? : boolean,
    privateMonthlyCost?: number
}

/**
 * Calculate the tax
 *
 * @param income          The income of the individual(s)
 * @param year            The year that income was earned
 * @param options         Additional options
 * @param options.couple  Calculate as is the income of a married couple
 * @param options.couple  Calculate as if buying public health insurance
 */
export default function incomeCalculator( income : number, year : Year, options : TaxOptions = {} ) {

    const result = {
        incomeTax : 0,
        solidarityTax : 0,
        hiMonthly : 0
    };
    let hiMonthly: number;
    if (options.publicHealthInsurance) {
      const yearlyContribution = (income * 0.146);
      if (yearlyContribution >= 4350) {
        hiMonthly = 363;
      } else {
        hiMonthly = Math.max(226, (yearlyContribution)/12);
      }
      income = income - hiMonthly * 12;
      result.hiMonthly = hiMonthly;
    }

    if ( options.couple ) {
        const spl = income / 2;
        result.incomeTax = Math.floor(
            2 * Math.floor( tax( spl, year, getZone( spl, year ) ) )
        );
    } else {
        result.incomeTax = Math.floor( tax( income, year, getZone( income, year ) ) );
    }

    result.solidarityTax = Math.round(
        solidarity( result.incomeTax, year, options.couple ) * 100
    ) / 100;

    return result;
}

let hourlyPayArr: number[] = [60, 65, 70, 75, 80, 85, 90, 95, 100];
let monthsWorkedArr: number[] = [6,7,8,9,10];

interface TaxObject {
  pretaxIncome: number;
  hoursWorked: number;
  hourlyRate: number;
  'monthsVacation': number;
  'yearly income (€)': number;
  'monthly income (€)': number;
  'living advantage ($)': number;
  'insuranceCostPerMonth': number;
};
let objArray: TaxObject[] = [];

const generateTaxObj = (monthWorked: number, hourlyRate: number, publicHealthInsurance: boolean, privateMonthlyCost?: number) => {
  let hoursWorked: number = monthWorked * 22 * 8;
  let pretaxIncome: number = hoursWorked * hourlyRate;
  const { incomeTax, solidarityTax, hiMonthly} = incomeCalculator(pretaxIncome, Year.Y2018, { publicHealthInsurance, privateMonthlyCost });
  const netIncome: number = pretaxIncome - incomeTax - solidarityTax - hiMonthly * 12;
  const monthlyAfterExpensesEurope: number = (Math.floor(netIncome/12) - 2500) * 1.2;
  const monthlyAfterExpensesUS: number = 4600*2 - 5000;
  return {
    pretaxIncome,
    hoursWorked,
    hourlyRate,
    'monthsVacation': 12 - monthWorked,
    'yearly income (€)': netIncome,
    'monthly income (€)': Math.floor(netIncome/12),
    'living advantage ($)': monthlyAfterExpensesEurope - monthlyAfterExpensesUS,
    'insuranceCostPerMonth': hiMonthly
  };
}

interface HealthSituation {
  publicHealthInsurance: boolean;
  privateMonthlyCost?: number;
}

let situations: HealthSituation[] = [
  { publicHealthInsurance: true }
];
let count = 0;
for (let { publicHealthInsurance, privateMonthlyCost } of situations){
  for (let monthWorked of monthsWorkedArr) {
    for (let hourlyRate of hourlyPayArr) {
      const obj: TaxObject = generateTaxObj(monthWorked, hourlyRate, publicHealthInsurance, privateMonthlyCost);
      objArray.push(obj);
    }
  }
  if (publicHealthInsurance) {
    jsonexport(objArray, (err: Error, csv: any) => {
      fs.writeFileSync('public_insurance.csv', csv, 'utf8', (err: Error) => {
        if (err) {
          console.log(err.message)
        }
        if (!err) {
          console.log('saved csv for public');
        }
      })
    })
    objArray = [];
  } else {
    count = count + 1;
    if (count === 2) {
      jsonexport(objArray, (err: Error, csv: any) => {
        fs.writeFileSync('private_insurance.csv', csv, 'utf8', (err: Error) => {
          if (err) {
            console.log(err.message)
          }
          if (!err) {
            console.log('saved csv for private for count' + count);
          }
        })
      });
      fs.writeFileSync('private_insurance.txt', JSON.stringify(objArray), 'utf8', (err: Error) => {
        if (err) {
          console.log(err.message)
        }
        if (!err) {
          console.log('saved json obj file for private for count' + count);
        }
      });
    }
  }
}
